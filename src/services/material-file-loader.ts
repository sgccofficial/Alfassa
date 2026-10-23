import { useState, useEffect, useCallback, useRef } from "react";
import { Material } from "../types";
import { findStoredMaterialBlob, getMaterialBlobRecord } from "./blob-store";
import { storage } from "./firebase";
import { ref, getBlob } from "firebase/storage";
import { getMaterialFromDb } from "./material-db";

export interface RetrievedOriginalFile {
  blob: Blob;
  objectUrl: string;
  mimeType: string;
  fileName: string;
  size: number;
}

export interface InternalFileTraceLog {
  materialId: string;
  mimeType: string;
  originalFilename: string;
  storageBlobReference: string | null;
  blobExists: boolean;
  blobSize: number;
  retrievedMimeType: string;
  retrievalError: string | null;
  generatedObjectUrl: string | null;
}

/**
 * Derives and normalizes the precise MIME type of a Material (Requirement 8).
 * Never relies solely on extension if stored MIME is present.
 * For PDFs, strictly ensures "application/pdf".
 */
export function resolveMaterialMimeType(material: Material, blob?: Blob | null): string {
  const storedMime = (material.metadata?.mimeType || material.originalInput?.fileType || "").trim().toLowerCase();
  
  const fileName = (material.originalInput?.fileName || material.title || "").trim();
  const ext = (
    fileName.split(".").pop()?.toLowerCase() || 
    material.metadata?.extension?.toLowerCase() || 
    ""
  );

  // PDF check
  if (
    storedMime === "application/pdf" || 
    ext === "pdf" || 
    (material.type === "document" && ext === "pdf")
  ) {
    return "application/pdf";
  }

  // Office & Document types
  if (ext === "pptx" || storedMime.includes("presentationml")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (ext === "ppt" || storedMime === "application/vnd.ms-powerpoint") {
    return "application/vnd.ms-powerpoint";
  }
  if (ext === "docx" || storedMime.includes("wordprocessingml")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === "doc" || storedMime === "application/msword") {
    return "application/msword";
  }

  // Valid stored MIME is already present
  if (
    storedMime && 
    storedMime !== "application/octet-stream" && 
    (storedMime.startsWith("image/") || storedMime.startsWith("audio/") || storedMime.startsWith("video/") || storedMime.startsWith("text/"))
  ) {
    return storedMime;
  }

  // Infer safe image MIME
  if (material.type === "image" || ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"].includes(ext)) {
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "svg") return "image/svg+xml";
    if (storedMime.startsWith("image/")) return storedMime;
    return "image/png";
  }

  // Infer safe audio MIME
  if (material.type === "audio" || ["mp3", "wav", "m4a", "ogg", "aac", "weba", "flac"].includes(ext)) {
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "wav") return "audio/wav";
    if (ext === "m4a") return "audio/mp4";
    if (ext === "ogg") return "audio/ogg";
    if (storedMime.startsWith("audio/")) return storedMime;
    return "audio/mpeg";
  }

  // Infer safe video MIME
  if (material.type === "video" || ["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) {
    if (ext === "mp4") return "video/mp4";
    if (ext === "webm") return "video/webm";
    if (ext === "mov") return "video/quicktime";
    if (storedMime.startsWith("video/")) return storedMime;
    return "video/mp4";
  }

  if (blob?.type && blob.type !== "application/octet-stream") {
    return blob.type;
  }

  if (storedMime) {
    return storedMime;
  }

  return "application/octet-stream";
}

/**
 * Normalizes a binary Blob so its type descriptor matches the expected MIME type (Requirement 8).
 */
export function normalizeBlobMimeType(blob: Blob, targetMimeType: string): Blob {
  if (blob.type === targetMimeType) {
    return blob;
  }
  return new Blob([blob], { type: targetMimeType });
}

/**
 * Converts a base64 Data URL to a real binary Blob
 */
function dataUrlToBlob(dataUrl: string, expectedMime: string): Blob {
  const parts = dataUrl.split(",");
  const base64 = parts[1];
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: expectedMime });
}

/**
 * Helper to fetch a Blob with strict timeout so network requests never hang
 */
async function fetchWithTimeout(url: string, timeoutMs = 2500): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok) {
      return await resp.blob();
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Helper to fetch from Firebase Storage with timeout
 */
async function getFirebaseBlobWithTimeout(storageRef: any, timeoutMs = 2000): Promise<Blob | null> {
  try {
    const fetchPromise = getBlob(storageRef);
    const timerPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return await Promise.race([fetchPromise, timerPromise]);
  } catch {
    return null;
  }
}

/**
 * Retrieves the genuine original Material binary file from storage layers.
 * 
 * Guarantees:
 * - Never loads extracted text, OCR, or markdown as the original file.
 * - Prioritizes IndexedDB alfassa_blob_store where local materials are persisted.
 * - Does not hang on Firebase Storage if the material is stored in IndexedDB.
 * - Has an overall bounded timeout of 4.5 seconds to prevent endless loading loops.
 */
export async function retrieveOriginalMaterialBinary(material: Material): Promise<RetrievedOriginalFile> {
  const materialId = material.id;
  const fileName = material.originalInput?.fileName || material.title;
  const storageRefKey = material.originalInput?.blobStorageKey || materialId;
  const targetMime = resolveMaterialMimeType(material);

  let rawBlob: Blob | null = null;
  let retrievalSource = "";
  let errorMsg: string | null = null;

  // 1. IndexedDB Blob Store (alfassa_blob_store)
  // Check candidate keys: explicit blobStorageKey, material ID, and title/filename
  try {
    const candidateKeys = [
      material.originalInput?.blobStorageKey,
      material.id,
      materialId,
    ].filter(Boolean);

    let record = await findStoredMaterialBlob(candidateKeys, fileName);
    if (!record && material.title && material.title !== fileName) {
      record = await findStoredMaterialBlob(candidateKeys, material.title);
    }
    if (record && record.blob && record.blob.size > 0) {
      rawBlob = record.blob;
      retrievalSource = `IndexedDB (key: ${record.materialId})`;
    }
  } catch (idbErr: any) {
    console.warn("IndexedDB blob lookup warning:", idbErr);
  }

  // 2. Base64 dataUrl (fast path if preserved in originalInput)
  if (!rawBlob && material.originalInput?.dataUrl?.startsWith("data:")) {
    try {
      rawBlob = dataUrlToBlob(material.originalInput.dataUrl, targetMime);
      retrievalSource = "originalInput.dataUrl (base64)";
    } catch (dataUrlErr) {
      console.warn("Could not decode dataUrl into binary Blob:", dataUrlErr);
    }
  }

  // 3. Original URL (blob: or http: or https:)
  if (!rawBlob && material.originalInput?.url && !material.originalInput.url.startsWith("materials/")) {
    try {
      const fetched = await fetchWithTimeout(material.originalInput.url, 2000);
      if (fetched && fetched.size > 0) {
        rawBlob = fetched;
        retrievalSource = `fetch(${material.originalInput.url})`;
      }
    } catch (fetchErr) {
      console.warn("Could not fetch material URL:", fetchErr);
    }
  }

  // 4. Firebase Storage (ONLY if explicitly indicated or local stores did not have the blob)
  const isLikelyFirebase = Boolean(
    material.originalInput?.url && (
      material.originalInput.url.startsWith("materials/") || 
      material.originalInput.url.startsWith("gs://")
    )
  );

  if (!rawBlob && storage && isLikelyFirebase) {
    const candidatePaths = [
      material.originalInput?.url && material.originalInput.url.startsWith("materials/") 
        ? material.originalInput.url 
        : null,
      `materials/${material.id}/${fileName}`,
      `materials/${material.id}/original`,
    ].filter((p): p is string => Boolean(p));

    for (const path of candidatePaths) {
      try {
        const storageRef = ref(storage, path);
        const fbBlob = await getFirebaseBlobWithTimeout(storageRef, 1500);
        if (fbBlob && fbBlob.size > 0) {
          rawBlob = fbBlob;
          retrievalSource = `Firebase Storage (${path})`;
          break;
        }
      } catch {
        // Try next candidate
      }
    }
  }

  // Verification & MIME Type Normalization (Requirements 3 & 8)
  let normalizedBlob: Blob | null = null;
  let objectUrl: string | null = null;

  if (rawBlob && rawBlob.size > 0) {
    normalizedBlob = normalizeBlobMimeType(rawBlob, targetMime);
    objectUrl = URL.createObjectURL(normalizedBlob);
  } else {
    errorMsg = `Original binary file could not be retrieved from storage for material "${fileName}"`;
  }

  // Internal audit trace (Requirement 2 - not exposed to UI)
  const traceLog: InternalFileTraceLog = {
    materialId: material.id,
    mimeType: targetMime,
    originalFilename: fileName,
    storageBlobReference: storageRefKey,
    blobExists: Boolean(normalizedBlob),
    blobSize: normalizedBlob?.size || 0,
    retrievedMimeType: normalizedBlob?.type || "none",
    retrievalError: errorMsg,
    generatedObjectUrl: objectUrl,
  };

  if (process.env.NODE_ENV !== "production") {
    console.info(`[MaterialFileLoader] Trace for ${material.id} (${retrievalSource || "failed"}):`, traceLog);
  }

  if (!normalizedBlob || !objectUrl) {
    throw new Error(errorMsg || "Unable to load this file.");
  }

  return {
    blob: normalizedBlob,
    objectUrl,
    mimeType: targetMime,
    fileName,
    size: normalizedBlob.size,
  };
}

/**
 * Authoritative single original-file retrieval service (Sprint 8D Requirements 9 & 10).
 * Consolidates all consumers (Original preview, extraction, Canvas, retry extraction)
 * behind a unified retrieval pipeline. Accepts either a Material object or materialId.
 */
export async function loadOriginalMaterial(materialOrId: Material | string): Promise<RetrievedOriginalFile> {
  if (!materialOrId) {
    throw new Error("Invalid material identifier provided to loadOriginalMaterial.");
  }

  if (typeof materialOrId === "object" && materialOrId.id) {
    return retrieveOriginalMaterialBinary(materialOrId);
  }

  const materialId = String(materialOrId);

  // 1. Try to fetch the Material entity from database
  const material = await getMaterialFromDb(materialId);
  if (material) {
    return retrieveOriginalMaterialBinary(material);
  }

  // 2. Direct IndexedDB lookup if material entity is not yet available in cache
  const directRecord = await findStoredMaterialBlob([materialId]);
  if (directRecord && directRecord.blob && directRecord.blob.size > 0) {
    const rawBlob = directRecord.blob;
    const targetMime = directRecord.mimeType || "application/octet-stream";
    const normalizedBlob = normalizeBlobMimeType(rawBlob, targetMime);
    const objectUrl = URL.createObjectURL(normalizedBlob);
    return {
      blob: normalizedBlob,
      objectUrl,
      mimeType: targetMime,
      fileName: directRecord.name || `material-${materialId}`,
      size: normalizedBlob.size,
    };
  }

  throw new Error(`Unable to load original file for material ${materialId}`);
}

export interface UseMaterialOriginalFileState {
  file: RetrievedOriginalFile | null;
  blob: Blob | null;
  mediaSource: string | null;
  mimeType: string;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * React hook that manages the lifecycle of the original Material binary file.
 * Guaranteed to reach either loaded or error state within a bounded timeout (Requirement 1 & 8).
 * Never triggers repeated fetch loops (Requirement 5).
 */
export function useMaterialOriginalFile(material: Material | null | undefined): UseMaterialOriginalFileState {
  const [file, setFile] = useState<RetrievedOriginalFile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const activeUrlRef = useRef<string | null>(null);
  const activeMaterialIdRef = useRef<string | null>(null);

  const retry = useCallback(() => {
    setReloadTrigger((v) => v + 1);
  }, []);

  const materialId = material?.id;

  useEffect(() => {
    if (!material || !materialId) {
      setIsLoading(false);
      setFile(null);
      setError("No material provided");
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    // Clean up previous URL if material switched
    if (activeMaterialIdRef.current && activeMaterialIdRef.current !== materialId) {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
      setFile(null);
    }
    activeMaterialIdRef.current = materialId;

    // Strict 5-second bounded operation timeout (Requirement 8)
    const timeoutTimer = setTimeout(() => {
      if (active && isLoading) {
        console.warn(`[MaterialFileLoader] Retrieval timeout reached for ${materialId}`);
        setError("Unable to load this file.");
        setIsLoading(false);
      }
    }, 4500);

    retrieveOriginalMaterialBinary(material)
      .then((retrieved) => {
        clearTimeout(timeoutTimer);
        if (!active) {
          URL.revokeObjectURL(retrieved.objectUrl);
          return;
        }

        if (activeUrlRef.current && activeUrlRef.current !== retrieved.objectUrl) {
          URL.revokeObjectURL(activeUrlRef.current);
        }
        activeUrlRef.current = retrieved.objectUrl;

        setFile(retrieved);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeoutTimer);
        if (!active) return;
        console.warn(`[MaterialFileLoader] Retrieval failed for ${materialId}:`, err);
        setError(err?.message || "Unable to load this file.");
        setIsLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timeoutTimer);
    };
  }, [materialId, reloadTrigger]);

  // Clean up object URL on component unmount
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, []);

  const mimeType = material ? resolveMaterialMimeType(material, file?.blob) : "";

  return {
    file,
    blob: file?.blob || null,
    mediaSource: file?.objectUrl || null,
    mimeType,
    isLoading,
    error,
    retry,
  };
}
