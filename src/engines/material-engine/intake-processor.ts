import { Material, Activity, MaterialType, MaterialSourceType } from "../../types";
import { generateMaterialId, generateActivityId, generateWorkspaceId } from "./id-generator";
import { detectMaterialType, getFileExtension, isValidWebUrl } from "./detector";
import { storeMaterialBlob } from "../../services/blob-store";

export interface IntakeOptions {
  userId: string;
  workspaceId?: string;
  sourceType: MaterialSourceType;
  origin?: string; // e.g. "drag-drop", "button-click", "clipboard-paste", "voice-recorder"
  customTitle?: string;
  audioDurationSeconds?: number;
  materialId?: string;
  onProgress?: (loaded: number, total: number) => void;
}

export interface IntakeInput {
  file?: File | Blob;
  fileName?: string;
  rawText?: string;
  url?: string;
  mimeType?: string;
}

export interface ProcessedIntakeResult {
  material: Material;
  activity: Activity;
}

/**
 * Reads a File or Blob as a Data URL string (for preview or preserving original payload)
 */
export async function readFileAsDataUrl(fileOrBlob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Reads a text file as raw string
 */
export async function readFileAsText(fileOrBlob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsText(fileOrBlob);
  });
}

/**
 * Derives a clean, un-invented title from the original input
 */
function deriveOriginalTitle(input: IntakeInput, detectedType: MaterialType): string {
  if (input.fileName) {
    return input.fileName.trim();
  }

  if (input.file instanceof File && input.file.name) {
    return input.file.name.trim();
  }

  if (detectedType === "link" && input.url) {
    try {
      const parsed = new URL(input.url);
      const pathname = parsed.pathname.replace(/\/$/, "");
      const segments = pathname.split("/").filter(Boolean);
      const lastSegment = segments.pop();
      if (lastSegment) {
        const cleanSegment = decodeURIComponent(lastSegment)
          .replace(/[_-]+/g, " ")
          .replace(/\.(html?|php|aspx?)$/i, "")
          .trim();
        if (cleanSegment.length > 0) {
          return `${parsed.hostname} · ${cleanSegment}`;
        }
      }
      return parsed.hostname;
    } catch {
      return input.url;
    }
  }

  if (detectedType === "audio") {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = now.toLocaleDateString([], { month: "short", day: "numeric" });
    return `Voice Note (${dateStr}, ${timeStr})`;
  }

  if (input.rawText) {
    const firstLine = input.rawText.trim().split("\n")[0].trim();
    if (firstLine.length > 0) {
      return firstLine.length > 60 ? firstLine.substring(0, 57) + "..." : firstLine;
    }
  }

  return "Untitled Material";
}

/**
 * Core Material Intake Processor.
 * Receives raw inputs, validates, identifies type, and packages
 * the Material and Activity entities without altering or summarizing content.
 * Accepts files of arbitrary size, storing binary blobs safely in IndexedDB
 * without imposing arbitrary 50MB limits.
 */
export async function processMaterialIntake(
  input: IntakeInput,
  options: IntakeOptions
): Promise<ProcessedIntakeResult> {
  const { userId, sourceType, origin = "direct", customTitle, audioDurationSeconds } = options;
  const workspaceId = options.workspaceId || generateWorkspaceId(userId);

  if (!userId) {
    throw new Error("Authentication required: Material intake requires an active user ID.");
  }

  // 1. Validation & sanitization
  if (!input.file && !input.rawText && !input.url) {
    throw new Error("Invalid input: No content or file provided for material intake.");
  }

  let fileSize = 0;
  let mimeType = input.mimeType || "";
  let fileName = input.fileName || "";
  let rawContent: string | undefined = input.url ? undefined : input.rawText;
  let dataUrl: string | undefined;

  // Stable Material ID generated early so binary blob can be keyed to it
  const materialId = options.materialId || generateMaterialId();

  if (input.file) {
    fileSize = input.file.size;
    mimeType = input.file.type || mimeType;
    if (input.file instanceof File) {
      fileName = input.file.name;
    }

    // Persist untouched original binary blob to IndexedDB with real progress tracking and verification
    await storeMaterialBlob(
      materialId, 
      input.file, 
      { name: fileName, mimeType },
      options.onProgress
    );

    // Only preserve thumbnail preview for tiny images under 64KB to prevent localStorage quota exhaustion
    const isSmallImage = (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(getFileExtension(fileName))) && fileSize <= 64 * 1024;
    if (isSmallImage) {
      try {
        dataUrl = await readFileAsDataUrl(input.file);
      } catch (err) {
        console.warn("Could not read file preview dataUrl:", err);
      }
    }

    // For plain text / markdown files, also read text content
    const ext = getFileExtension(fileName);
    if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
      try {
        rawContent = await readFileAsText(input.file);
      } catch (err) {
        console.warn("Could not read text content:", err);
      }
    }
  }

  // 2. Identify basic type
  let detectedType: MaterialType = detectMaterialType({
    file: input.file,
    fileName,
    mimeType,
    rawText: input.rawText,
  });

  // If input was explicitly a URL
  if (input.url && isValidWebUrl(input.url)) {
    detectedType = "link";
  }

  // 3. Title preservation
  const title = customTitle?.trim() || deriveOriginalTitle(input, detectedType);

  // 4. Construct Stable Material Entity (mat_...)
  const now = new Date().toISOString();

  const material: Material = {
    id: materialId,
    userId,
    workspaceId,
    title,
    type: detectedType,
    originalInput: {
      sourceType,
      rawContent,
      url: input.url,
      fileName: fileName || undefined,
      fileType: mimeType || undefined,
      fileSize: fileSize || undefined,
      dataUrl,
      blobStorageKey: input.file ? materialId : undefined,
    },
    metadata: {
      mimeType: mimeType || undefined,
      size: fileSize || undefined,
      extension: getFileExtension(fileName) || undefined,
      recordedDuration: audioDurationSeconds,
      origin,
      clientTimestamp: now,
      storageEngine: input.file ? "indexed_db" : (input.url ? "url" : "inline"),
    },
    status: "intake_completed",
    processingStatus: "pending", // Initial state: material preserved, ready for extraction
    pipeline: {
      stage: "ready_for_review",
      reviewPending: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  // 5. Construct Stable Activity Entity (act_...)
  const activityId = generateActivityId();
  const typeDisplay = detectedType.charAt(0).toUpperCase() + detectedType.slice(1);
  const activity: Activity = {
    id: activityId,
    userId,
    workspaceId,
    type: "material_intake",
    action: "created",
    entityId: materialId,
    entityType: "material",
    description: `Brought in ${typeDisplay}: ${title}`,
    metadata: {
      materialType: detectedType,
      title,
      size: fileSize,
      sourceType,
      origin,
    },
    createdAt: now,
  };

  // [Sprint 2+ Extension Point]: Future OCR processing hook:
  // if (detectedType === 'image' || detectedType === 'document') { ... }

  // [Sprint 2+ Extension Point]: Future Audio transcription hook:
  // if (detectedType === 'audio') { ... }

  // [Sprint 2+ Extension Point]: Future Duplicate detection hook:
  // await checkDuplicates(material);

  // [Sprint 2+ Extension Point]: Future Workspace Review pipeline trigger:
  // await queueWorkspaceReview(material);

  return { material, activity };
}
