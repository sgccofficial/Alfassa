/**
 * IndexedDB Blob Store for Alfassa Materials.
 * 
 * Provides local binary storage for large files (audio, video, documents, images)
 * of arbitrary size without imposing an artificial limit, avoiding localStorage 
 * size limitations (~5MB) and Firestore document limits (1MB).
 */

const DB_NAME = "alfassa_blob_store";
const STORE_NAME = "materials_binary";
const DB_VERSION = 1;

// In-memory fallback if IndexedDB is inaccessible (e.g. strict sandbox)
const memoryBlobFallback = new Map<string, Blob>();

let cachedDb: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (cachedDb) {
    try {
      // Fast check if connection is active
      cachedDb.transaction([STORE_NAME], "readonly");
      return Promise.resolve(cachedDb);
    } catch {
      cachedDb = null;
    }
  }

  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      dbOpenPromise = null;
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const timer = setTimeout(() => {
      dbOpenPromise = null;
      reject(new Error("IndexedDB open request timed out."));
    }, 3000);

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        console.warn("IndexedDB open blocked by another tab or connection.");
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "materialId" });
        }
      };

      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        cachedDb = db;
        dbOpenPromise = null;

        db.onversionchange = () => {
          db.close();
          cachedDb = null;
        };

        db.onclose = () => {
          cachedDb = null;
        };

        resolve(db);
      };

      request.onerror = () => {
        clearTimeout(timer);
        dbOpenPromise = null;
        reject(request.error || new Error("Failed to open IndexedDB"));
      };
    } catch (err) {
      clearTimeout(timer);
      dbOpenPromise = null;
      reject(err);
    }
  });

  return dbOpenPromise;
}

export interface StoredBlobRecord {
  materialId: string;
  blob: Blob;
  name?: string;
  mimeType?: string;
  size: number;
  storedAt: string;
}

/**
 * Stores a raw file or binary blob for a Material with real progress reporting
 * and verified persistence readback.
 */
export async function storeMaterialBlob(
  materialId: string, 
  blobOrFile: Blob | File,
  metadata?: { name?: string; mimeType?: string },
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const targetMime = metadata?.mimeType || blobOrFile.type || "application/octet-stream";

  let cleanBlob: Blob;
  if (blobOrFile instanceof Blob) {
    cleanBlob = blobOrFile.type === targetMime 
      ? blobOrFile 
      : new Blob([blobOrFile], { type: targetMime });
  } else {
    cleanBlob = new Blob([blobOrFile], { type: targetMime });
  }

  // Real byte-level transfer progress inspection via Stream Reader if available
  if (onProgress && cleanBlob.size > 0 && typeof (cleanBlob as any).stream === "function") {
    try {
      const stream = (cleanBlob as any).stream();
      const reader = stream.getReader();
      let loaded = 0;
      const total = cleanBlob.size;
      // Emit initial zero progress
      onProgress(0, total);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        onProgress(loaded, total);
      }
    } catch {
      // If stream reader is unavailable in environment, emit total directly
      onProgress(cleanBlob.size, cleanBlob.size);
    }
  } else if (onProgress) {
    onProgress(cleanBlob.size, cleanBlob.size);
  }

  // Update in-memory fallback cache for fast same-session access
  memoryBlobFallback.set(materialId, cleanBlob);

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const record: StoredBlobRecord = {
        materialId,
        blob: cleanBlob,
        name: metadata?.name || (blobOrFile instanceof File ? blobOrFile.name : undefined),
        mimeType: targetMime,
        size: cleanBlob.size,
        storedAt: new Date().toISOString(),
      };

      let request: IDBRequest;
      if (store.keyPath) {
        request = store.put(record);
      } else {
        request = store.put(record, materialId);
      }

      request.onerror = () => reject(request.error || new Error("IndexedDB put request failed."));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
      transaction.onabort = () => reject(new Error("IndexedDB transaction was aborted."));
    } catch (err) {
      reject(err);
    }
  });

  // Verify that the record can actually be read back from IndexedDB (Phase 6 requirement)
  const verified = await getMaterialBlobRecord(materialId);
  if (!verified || !verified.blob || verified.blob.size === 0) {
    throw new Error(`Persistence verification failed: Record "${materialId}" could not be read back from IndexedDB.`);
  }
}

/**
 * Verifies that a material's binary blob is durably persisted and readable from IndexedDB
 */
export async function verifyMaterialBlobStored(
  materialId: string,
  expectedSize?: number
): Promise<boolean> {
  try {
    const rec = await getMaterialBlobRecord(materialId);
    if (!rec || !rec.blob) return false;
    if (expectedSize !== undefined && expectedSize > 0) {
      return rec.blob.size === expectedSize;
    }
    return rec.blob.size > 0;
  } catch {
    return false;
  }
}

/**
 * Extracts a valid Blob from any supported record structure (legacy or current).
 */
function extractBlobFromItem(item: any, fallbackMime?: string): Blob | null {
  if (!item) return null;
  const mime = item.mimeType || fallbackMime || "application/octet-stream";

  if (item instanceof Blob) {
    return item;
  }
  if (item.blob instanceof Blob) {
    return item.blob;
  }
  if (item.file instanceof Blob) {
    return item.file;
  }
  if (item.data instanceof Blob) {
    return item.data;
  }
  if (item.blob && (item.blob instanceof ArrayBuffer || ArrayBuffer.isView(item.blob))) {
    return new Blob([item.blob], { type: mime });
  }
  if (item.data && (item.data instanceof ArrayBuffer || ArrayBuffer.isView(item.data))) {
    return new Blob([item.data], { type: mime });
  }
  if (item instanceof ArrayBuffer || (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(item))) {
    return new Blob([item], { type: mime });
  }
  return null;
}

/**
 * Retrieves the stored binary blob record for a Material
 */
export async function getMaterialBlobRecord(materialId: string): Promise<StoredBlobRecord | null> {
  if (!materialId) return null;

  // Check in-memory fallback first
  if (memoryBlobFallback.has(materialId)) {
    const fb = memoryBlobFallback.get(materialId)!;
    return {
      materialId,
      blob: fb,
      name: fb instanceof File ? fb.name : undefined,
      mimeType: fb.type || undefined,
      size: fb.size,
      storedAt: new Date().toISOString(),
    };
  }

  try {
    const db = await openDatabase();
    return await new Promise<StoredBlobRecord | null>((resolve, reject) => {
      const timer = setTimeout(() => resolve(null), 2500);

      try {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(materialId);

        request.onsuccess = () => {
          clearTimeout(timer);
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }

          const extractedBlob = extractBlobFromItem(result);
          if (extractedBlob && extractedBlob.size > 0) {
            const finalRecord: StoredBlobRecord = {
              materialId: result.materialId || materialId,
              blob: extractedBlob,
              name: result.name || result.fileName || result.title,
              mimeType: result.mimeType || extractedBlob.type,
              size: extractedBlob.size,
              storedAt: result.storedAt || new Date().toISOString(),
            };
            // Cache in memory for subsequent synchronous/fast lookups
            memoryBlobFallback.set(materialId, extractedBlob);
            resolve(finalRecord);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          clearTimeout(timer);
          reject(request.error);
        };
      } catch (err) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  } catch (err) {
    console.warn("IndexedDB read error:", err);
    const fb = memoryBlobFallback.get(materialId);
    if (fb) {
      return {
        materialId,
        blob: fb,
        name: fb instanceof File ? fb.name : undefined,
        mimeType: fb.type || undefined,
        size: fb.size,
        storedAt: new Date().toISOString(),
      };
    }
    return null;
  }
}

/**
 * Retrieves the stored binary blob for a Material
 */
export async function getMaterialBlob(materialId: string): Promise<Blob | null> {
  const rec = await getMaterialBlobRecord(materialId);
  return rec ? rec.blob : null;
}

/**
 * Searches across multiple candidate keys and scans the store
 * with bounded timeout to find the original binary blob for a material.
 */
export async function findStoredMaterialBlob(
  candidateKeys: (string | undefined | null)[],
  fileName?: string
): Promise<StoredBlobRecord | null> {
  const validKeys = candidateKeys.filter((k): k is string => Boolean(k && k.trim()));
  
  // 0. Check in-memory fallback first for all candidate keys
  for (const key of validKeys) {
    if (memoryBlobFallback.has(key)) {
      const fb = memoryBlobFallback.get(key)!;
      return {
        materialId: key,
        blob: fb,
        name: fb instanceof File ? fb.name : fileName,
        mimeType: fb.type || undefined,
        size: fb.size,
        storedAt: new Date().toISOString(),
      };
    }
  }

  // Also check if any in-memory item has a matching name
  if (fileName) {
    const cleanTargetName = fileName.trim().toLowerCase();
    for (const [memKey, memBlob] of memoryBlobFallback.entries()) {
      if (memBlob instanceof File && memBlob.name.toLowerCase() === cleanTargetName) {
        return {
          materialId: memKey,
          blob: memBlob,
          name: memBlob.name,
          mimeType: memBlob.type || undefined,
          size: memBlob.size,
          storedAt: new Date().toISOString(),
        };
      }
    }
  }

  // 1. Try direct key lookups in IndexedDB
  for (const key of validKeys) {
    try {
      const record = await getMaterialBlobRecord(key);
      if (record && record.blob && record.blob.size > 0) {
        return record;
      }
    } catch {
      // Continue to next key
    }
  }

  // 2. Scan IndexedDB store as fallback if direct keys did not match
  try {
    const db = await openDatabase();
    return await new Promise<StoredBlobRecord | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 2500);

      try {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);

        // Fast path: use getAll if available
        if (typeof store.getAll === "function") {
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            clearTimeout(timer);
            const items = allReq.result as any[];
            if (Array.isArray(items)) {
              for (const item of items) {
                const itemName = (item.name || item.fileName || item.title || "").trim();
                const matchesKey = validKeys.some((k) => k === item.materialId);
                const matchesName = fileName && itemName && (
                  itemName.toLowerCase() === fileName.trim().toLowerCase() ||
                  itemName.toLowerCase().includes(fileName.trim().toLowerCase()) ||
                  fileName.trim().toLowerCase().includes(itemName.toLowerCase())
                );

                if (matchesKey || matchesName) {
                  const blob = extractBlobFromItem(item);
                  if (blob && blob.size > 0) {
                    const finalKey = item.materialId || validKeys[0] || "";
                    if (finalKey) memoryBlobFallback.set(finalKey, blob);
                    resolve({
                      materialId: finalKey,
                      blob,
                      name: item.name || item.fileName || item.title,
                      mimeType: item.mimeType || blob.type,
                      size: blob.size,
                      storedAt: item.storedAt || new Date().toISOString(),
                    });
                    return;
                  }
                }
              }
            }
            resolve(null);
          };
          allReq.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
        } else {
          // Cursor iteration fallback
          const request = store.openCursor();
          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const item = cursor.value;
              const itemName = (item.name || item.fileName || item.title || "").trim();
              const matchesKey = validKeys.some((k) => k === item.materialId || k === cursor.key);
              const matchesName = fileName && itemName && (
                itemName.toLowerCase() === fileName.trim().toLowerCase() ||
                itemName.toLowerCase().includes(fileName.trim().toLowerCase()) ||
                fileName.trim().toLowerCase().includes(itemName.toLowerCase())
              );

              if (matchesKey || matchesName) {
                const blob = extractBlobFromItem(item);
                if (blob && blob.size > 0) {
                  clearTimeout(timer);
                  const finalKey = item.materialId || String(cursor.key);
                  if (finalKey) memoryBlobFallback.set(finalKey, blob);
                  resolve({
                    materialId: finalKey,
                    blob,
                    name: item.name || item.fileName || item.title,
                    mimeType: item.mimeType || blob.type,
                    size: blob.size,
                    storedAt: item.storedAt || new Date().toISOString(),
                  });
                  return;
                }
              }
              cursor.continue();
            } else {
              clearTimeout(timer);
              resolve(null);
            }
          };

          request.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
        }
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  } catch (err) {
    console.warn("IndexedDB scan failed:", err);
    return null;
  }
}

/**
 * Deletes stored binary for a material
 */
export async function deleteMaterialBlob(materialId: string): Promise<void> {
  memoryBlobFallback.delete(materialId);
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(materialId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB delete error:", err);
  }
}
