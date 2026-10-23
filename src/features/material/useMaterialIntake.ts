import { useState, useCallback } from "react";
import { useAuth } from "../../shared/providers/AuthProvider";
import { 
  processMaterialIntake, 
  IntakeInput, 
  IntakeOptions,
  extractFromDataTransfer,
  readFromAsyncClipboard
} from "../../engines/material-engine";
import { detectMaterialType, getFileExtension, isValidWebUrl } from "../../engines/material-engine/detector";
import { generateMaterialId, generateActivityId, generateWorkspaceId } from "../../engines/material-engine/id-generator";
import { 
  saveMaterialToDb, 
  saveActivityToDb, 
  getMaterialFromDb, 
  deleteMaterialFromDb,
  saveCachedMaterials,
  getCachedMaterials
} from "../../services/material-db";
import { extractFromMaterial } from "../../engines/extraction-engine/processor";
import { saveExtractionToDb, updateMaterialProcessingStatus } from "../../services/extraction-db";
import { deleteMaterialBlob, storeMaterialBlob, verifyMaterialBlobStored } from "../../services/blob-store";
import { Material, Activity, MaterialType } from "../../types";

export interface IntakeState {
  isProcessing: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  lastPreservedMaterial: Material | null;
}

/**
 * Creates an immediate optimistic Material record with stable identity and initial saving/uploading state.
 */
function createInitialMaterial(params: {
  id: string;
  userId: string;
  workspaceId: string;
  title: string;
  type: MaterialType;
  sourceType: "upload" | "paste" | "link" | "recording";
  origin: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  url?: string;
  rawContent?: string;
  durationSeconds?: number;
}): Material {
  const now = new Date().toISOString();
  return {
    id: params.id,
    userId: params.userId,
    workspaceId: params.workspaceId,
    title: params.title,
    type: params.type,
    originalInput: {
      sourceType: params.sourceType,
      fileName: params.fileName,
      fileType: params.fileType,
      fileSize: params.fileSize,
      url: params.url,
      rawContent: params.rawContent,
      blobStorageKey: (params.fileSize !== undefined || params.fileName) ? params.id : undefined,
    },
    metadata: {
      mimeType: params.fileType,
      size: params.fileSize,
      extension: params.fileName ? getFileExtension(params.fileName) : undefined,
      recordedDuration: params.durationSeconds,
      origin: params.origin,
      clientTimestamp: now,
      storageEngine: params.fileSize !== undefined ? "indexed_db" : (params.url ? "url" : "inline"),
    },
    status: "saving",
    processingStatus: "pending",
    uploadProgress: {
      loaded: 0,
      total: params.fileSize || 0,
      percentage: params.fileSize && params.fileSize > 0 ? 0 : undefined,
      state: "saving",
    },
    pipeline: {
      stage: "ready_for_review",
      reviewPending: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function useMaterialIntake() {
  const { user } = useAuth();
  const [state, setState] = useState<IntakeState>({
    isProcessing: false,
    statusMessage: null,
    errorMessage: null,
    lastPreservedMaterial: null,
  });

  const clearMessages = useCallback(() => {
    setState((prev) => ({
      ...prev,
      statusMessage: null,
      errorMessage: null,
    }));
  }, []);

  /**
   * Updates an in-memory & cached material in-place during lifecycle transitions
   */
  const updateMaterialRecord = useCallback(async (material: Material) => {
    await saveMaterialToDb(material);
  }, []);

  /**
   * Internal processor for a single item with immediate visibility and distinct phases
   */
  const handleIntake = useCallback(
    async (
      input: IntakeInput, 
      options: Partial<IntakeOptions> = {}
    ): Promise<{ material: Material; activity: Activity } | null> => {
      const currentUserId = user?.uid || "guest-user";
      const workspaceId = options.workspaceId || generateWorkspaceId(currentUserId);
      const stableMaterialId = options.materialId || generateMaterialId();
      const origin = options.origin || "direct";
      const sourceType = options.sourceType || "upload";

      const effectiveName = input.fileName || (input.file instanceof File ? input.file.name : "");
      const detectedType = detectMaterialType({
        file: input.file,
        fileName: effectiveName,
        mimeType: input.mimeType || input.file?.type,
        rawText: input.rawText,
      });

      const title = options.customTitle?.trim() || effectiveName || (input.url ? new URL(input.url).hostname : "Untitled Material");

      // 1. PHASE 2: Create stable material record & show immediately in Your Materials
      const immediateMat = createInitialMaterial({
        id: stableMaterialId,
        userId: currentUserId,
        workspaceId,
        title,
        type: input.url && isValidWebUrl(input.url) ? "link" : detectedType,
        sourceType,
        origin,
        fileName: effectiveName || undefined,
        fileType: input.mimeType || input.file?.type || undefined,
        fileSize: input.file?.size,
        url: input.url,
        rawContent: input.rawText,
        durationSeconds: options.audioDurationSeconds,
      });

      // Show in list immediately
      await saveMaterialToDb(immediateMat);

      // 2. PHASE 3: Stream and persist binary with real progress events
      let lastProgressTime = 0;
      let lastPercentage: number | undefined = undefined;

      try {
        const result = await processMaterialIntake(input, {
          userId: currentUserId,
          workspaceId,
          sourceType,
          origin,
          customTitle: title,
          audioDurationSeconds: options.audioDurationSeconds,
          materialId: stableMaterialId,
          onProgress: (loaded, total) => {
            const percentage = total > 0 ? Math.round((loaded / total) * 100) : undefined;
            const now = Date.now();
            if (
              loaded === total || 
              loaded === 0 || 
              (percentage !== lastPercentage && now - lastProgressTime >= 200)
            ) {
              lastProgressTime = now;
              lastPercentage = percentage;
              const updated = {
                ...immediateMat,
                uploadProgress: {
                  loaded,
                  total,
                  percentage,
                  state: "saving" as const,
                },
                updatedAt: new Date().toISOString(),
              };
              saveMaterialToDb(updated);
            }
          },
        });

        // 3. PHASE 4: UPLOAD COMPLETE — Verify durable persistence in IndexedDB
        if (input.file) {
          const isPersisted = await verifyMaterialBlobStored(stableMaterialId, input.file.size);
          if (!isPersisted) {
            throw new Error("Persisted binary could not be verified in local storage.");
          }
        }

        const savedMaterial: Material = {
          ...result.material,
          status: "upload_complete",
          uploadProgress: {
            loaded: input.file?.size || 0,
            total: input.file?.size || 0,
            percentage: 100,
            state: "complete",
          },
          updatedAt: new Date().toISOString(),
        };

        // Persist verified material
        await saveMaterialToDb(savedMaterial);

        // 4. PHASE 5: RECENT ACTIVITY — Log activity only after confirmed persistence
        await saveActivityToDb(result.activity);

        // 5. PHASE 4: PROCESSING — Transition into extraction phase
        (async () => {
          try {
            await updateMaterialProcessingStatus(savedMaterial.id, savedMaterial.userId, "processing");
            const extraction = await extractFromMaterial(savedMaterial, input.file);
            await saveExtractionToDb(extraction);
            await updateMaterialProcessingStatus(savedMaterial.id, savedMaterial.userId, extraction.processingStatus);
          } catch (procErr: any) {
            console.error("Async extraction error:", procErr);
            const failedMat = {
              ...savedMaterial,
              processingStatus: "failed" as const,
              errorDetail: {
                stage: "extraction" as const,
                message: procErr?.message || "Content extraction failed.",
                timestamp: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            };
            await saveMaterialToDb(failedMat);
            await updateMaterialProcessingStatus(savedMaterial.id, savedMaterial.userId, "failed");
          }
        })();

        return { material: savedMaterial, activity: result.activity };
      } catch (error: any) {
        console.error("Material persistence failure:", error);
        // Record saving error explicitly; do NOT claim saved or create activity
        const failedMat: Material = {
          ...immediateMat,
          status: "processing_failed",
          processingStatus: "failed",
          uploadProgress: {
            loaded: 0,
            total: input.file?.size || 0,
            state: "failed",
            error: error?.message || "Storage persistence failed.",
          },
          errorDetail: {
            stage: "saving",
            message: error?.message || "Failed to persist original file to storage.",
            timestamp: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        };
        await saveMaterialToDb(failedMat);
        throw error;
      }
    },
    [user]
  );

  /**
   * Preserves one or more files with immediate visibility and individual progress
   */
  const intakeFiles = useCallback(
    async (fileList: FileList | File[], origin = "upload") => {
      const files = Array.from(fileList);
      if (!files.length) {
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: "No files were selected for intake.",
          lastPreservedMaterial: null,
        });
        return [];
      }

      const currentUserId = user?.uid || "guest-user";
      const workspaceId = generateWorkspaceId(currentUserId);
      const sourceType = origin === "clipboard-paste" ? "paste" : "upload";

      setState({
        isProcessing: true,
        statusMessage: files.length === 1 
          ? `Saving "${files[0].name}"...` 
          : `Saving ${files.length} files...`,
        errorMessage: null,
        lastPreservedMaterial: null,
      });

      // PHASE 2 & 7: Immediately register ALL files in Your Materials with stable IDs
      const fileTasks: { file: File; id: string; initial: Material }[] = [];
      for (const file of files) {
        const stableId = generateMaterialId();
        const initial = createInitialMaterial({
          id: stableId,
          userId: currentUserId,
          workspaceId,
          title: file.name,
          type: detectMaterialType({ file, fileName: file.name, mimeType: file.type }),
          sourceType,
          origin,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        fileTasks.push({ file, id: stableId, initial });
        // Immediate local emission
        await saveMaterialToDb(initial);
      }

      const preserved: Material[] = [];
      const failures: string[] = [];

      // Process each file with real progress tracking
      for (const task of fileTasks) {
        try {
          const res = await handleIntake(
            { file: task.file, fileName: task.file.name, mimeType: task.file.type },
            { sourceType, origin, materialId: task.id }
          );
          if (res) {
            preserved.push(res.material);
          }
        } catch (err: any) {
          failures.push(`${task.file.name}: ${err?.message || "Preservation failed"}`);
        }
      }

      if (preserved.length > 0) {
        const successMsg = preserved.length === 1
          ? `Preserved "${preserved[0].title}"`
          : `Preserved ${preserved.length} items (${preserved.map((m) => m.title).slice(0, 2).join(", ")}${preserved.length > 2 ? ` +${preserved.length - 2} more` : ""})`;

        setState({
          isProcessing: false,
          statusMessage: successMsg,
          errorMessage: failures.length > 0 ? `Could not preserve: ${failures.join("; ")}` : null,
          lastPreservedMaterial: preserved[preserved.length - 1],
        });
      } else {
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: failures.join("; ") || "Failed to preserve files.",
          lastPreservedMaterial: null,
        });
      }

      return preserved;
    },
    [handleIntake, user]
  );

  /**
   * Preserves a single web link verbatim with immediate entry
   */
  const intakeUrl = useCallback(
    async (url: string, origin = "direct-url", customTitle?: string) => {
      setState({
        isProcessing: true,
        statusMessage: "Preserving web link...",
        errorMessage: null,
        lastPreservedMaterial: null,
      });

      try {
        let finalTitle = customTitle?.trim();
        if (!finalTitle) {
          try {
            const res = await fetch("/api/fetch-web-content", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.title && typeof data.title === "string" && data.title.trim().length > 0) {
                finalTitle = data.title.trim();
              }
            }
          } catch (e) {
            console.warn("Failed to fetch title for URL:", e);
          }
        }

        const res = await handleIntake(
          { url },
          { sourceType: origin === "clipboard-paste" ? "paste" : "link", origin, customTitle: finalTitle }
        );

        if (res) {
          setState({
            isProcessing: false,
            statusMessage: `Preserved link "${res.material.title}"`,
            errorMessage: null,
            lastPreservedMaterial: res.material,
          });
          return res.material;
        }
      } catch (err: any) {
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: err?.message || "Failed to preserve web link.",
          lastPreservedMaterial: null,
        });
      }
      return null;
    },
    [handleIntake]
  );

  /**
   * Preserves multiple web links independently
   */
  const intakeUrls = useCallback(
    async (urls: string[], origin = "clipboard-paste") => {
      if (!urls.length) return [];

      setState({
        isProcessing: true,
        statusMessage: urls.length === 1 
          ? "Preserving web link..." 
          : `Preserving ${urls.length} web links...`,
        errorMessage: null,
        lastPreservedMaterial: null,
      });

      const preserved: Material[] = [];
      const failures: string[] = [];

      for (const url of urls) {
        try {
          let finalTitle: string | undefined;
          try {
            const res = await fetch("/api/fetch-web-content", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.title && typeof data.title === "string") {
                finalTitle = data.title.trim();
              }
            }
          } catch (e) {
            console.warn("Failed to fetch title for URL:", e);
          }

          const res = await handleIntake(
            { url },
            { sourceType: origin === "clipboard-paste" ? "paste" : "link", origin, customTitle: finalTitle }
          );
          if (res) preserved.push(res.material);
        } catch (err: any) {
          failures.push(`${url}: ${err?.message || "Failed"}`);
        }
      }

      if (preserved.length > 0) {
        setState({
          isProcessing: false,
          statusMessage: preserved.length === 1 
            ? `Preserved link "${preserved[0].title}"` 
            : `Preserved ${preserved.length} web links independently`,
          errorMessage: failures.length > 0 ? `Failed links: ${failures.join("; ")}` : null,
          lastPreservedMaterial: preserved[preserved.length - 1],
        });
      } else {
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: failures.join("; ") || "Failed to preserve web links.",
          lastPreservedMaterial: null,
        });
      }

      return preserved;
    },
    [handleIntake]
  );

  /**
   * Preserves an audio recording verbatim with immediate visibility
   */
  const intakeAudioBlob = useCallback(
    async (blob: Blob, durationSeconds: number, title?: string) => {
      setState({
        isProcessing: true,
        statusMessage: "Preserving voice note...",
        errorMessage: null,
        lastPreservedMaterial: null,
      });

      try {
        const audioTitle = title || "Voice Recording.webm";
        const res = await handleIntake(
          { file: blob, fileName: audioTitle, mimeType: blob.type || "audio/webm" },
          { sourceType: "recording", origin: "voice-recorder", audioDurationSeconds: durationSeconds, customTitle: audioTitle }
        );

        if (res) {
          setState({
            isProcessing: false,
            statusMessage: `Preserved voice note "${res.material.title}"`,
            errorMessage: null,
            lastPreservedMaterial: res.material,
          });
          return res.material;
        }
      } catch (err: any) {
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: err?.message || "Failed to preserve voice recording.",
          lastPreservedMaterial: null,
        });
      }
      return null;
    },
    [handleIntake]
  );

  /**
   * Preserves raw text verbatim
   */
  const intakeText = useCallback(
    async (text: string, origin = "clipboard-paste") => {
      setState({
        isProcessing: true,
        statusMessage: "Preserving text...",
        errorMessage: null,
        lastPreservedMaterial: null,
      });

      try {
        const res = await handleIntake(
          { rawText: text },
          { sourceType: "paste", origin }
        );

        if (res) {
          setState({
            isProcessing: false,
            statusMessage: "Text preserved.",
            errorMessage: null,
            lastPreservedMaterial: res.material,
          });
          return res.material;
        }
      } catch (err: any) {
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: err?.message || "Failed to preserve text.",
          lastPreservedMaterial: null,
        });
      }
      return null;
    },
    [handleIntake]
  );

  /**
   * High-level DataTransfer intake handler
   */
  const intakeDataTransfer = useCallback(
    async (dataTransfer: DataTransfer, origin = "drag-and-drop") => {
      const extracted = extractFromDataTransfer(dataTransfer);

      switch (extracted.kind) {
        case "files":
          if (extracted.files && extracted.files.length > 0) {
            return intakeFiles(extracted.files, origin);
          }
          break;

        case "urls":
          if (extracted.urls && extracted.urls.length > 0) {
            return intakeUrls(extracted.urls, origin);
          }
          break;

        case "text":
          if (extracted.text) {
            const trimmed = extracted.text.trim();
            if (isValidWebUrl(trimmed)) {
              const m = await intakeUrl(trimmed, origin);
              return m ? [m] : [];
            } else {
              const m = await intakeText(extracted.text, origin);
              return m ? [m] : [];
            }
          }
          break;

        case "empty":
        case "unsupported":
          setState({
            isProcessing: false,
            statusMessage: null,
            errorMessage: extracted.reason || "Content cannot be preserved.",
            lastPreservedMaterial: null,
          });
          return [];
      }

      return [];
    },
    [intakeFiles, intakeUrls, intakeUrl, intakeText]
  );

  /**
   * Async clipboard intake
   */
  const intakeFromClipboardApi = useCallback(async () => {
    setState({
      isProcessing: true,
      statusMessage: "Reading clipboard...",
      errorMessage: null,
      lastPreservedMaterial: null,
    });

    const extracted = await readFromAsyncClipboard();

    switch (extracted.kind) {
      case "files":
        if (extracted.files && extracted.files.length > 0) {
          return intakeFiles(extracted.files, "clipboard-paste");
        }
        break;

      case "urls":
        if (extracted.urls && extracted.urls.length > 0) {
          return intakeUrls(extracted.urls, "clipboard-paste");
        }
        break;

      case "text":
        if (extracted.text) {
          const m = await intakeText(extracted.text, "clipboard-paste");
          return m ? [m] : [];
        }
        break;

      case "empty":
      case "unsupported":
        setState({
          isProcessing: false,
          statusMessage: null,
          errorMessage: extracted.reason || "Content cannot be preserved.",
          lastPreservedMaterial: null,
        });
        return [];
    }

    return [];
  }, [intakeFiles, intakeUrls, intakeText]);

  /**
   * Re-runs the extraction pipeline for an existing preserved material without re-uploading original binary
   */
  const reprocessMaterial = useCallback(async (materialOrId: Material | string) => {
    let material: Material | null = null;
    const currentUserId = user?.uid || "guest-user";

    if (typeof materialOrId === "string") {
      material = await getMaterialFromDb(materialOrId, currentUserId);
    } else if (materialOrId && typeof materialOrId === "object") {
      material = materialOrId;
    }

    if (!material) {
      console.warn("Reprocess aborted: material not found", materialOrId);
      return null;
    }

    try {
      await updateMaterialProcessingStatus(material.id, material.userId, "processing");
      const extraction = await extractFromMaterial(material);
      await saveExtractionToDb(extraction);
      await updateMaterialProcessingStatus(material.id, material.userId, extraction.processingStatus);
      return extraction;
    } catch (err: any) {
      console.error("Reprocess error:", err);
      if (material) {
        const failedMat = {
          ...material,
          processingStatus: "failed" as const,
          errorDetail: {
            stage: "extraction" as const,
            message: err?.message || "Extraction retry failed.",
            timestamp: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        };
        await saveMaterialToDb(failedMat);
        await updateMaterialProcessingStatus(material.id, material.userId, "failed");
      }
      throw err;
    }
  }, [user?.uid]);

  const deleteMaterial = useCallback(async (materialId: string, userId: string, blobStorageKey?: string) => {
    try {
      await deleteMaterialFromDb(materialId, userId);
      if (blobStorageKey) {
        await deleteMaterialBlob(materialId);
      }
      return true;
    } catch (err) {
      console.error("Delete material error:", err);
      return false;
    }
  }, []);

  return {
    ...state,
    clearMessages,
    intakeFiles,
    intakeUrl,
    intakeUrls,
    intakeAudioBlob,
    intakeText,
    intakeDataTransfer,
    intakeFromClipboardApi,
    handleIntake,
    reprocessMaterial,
    deleteMaterial,
  };
}
