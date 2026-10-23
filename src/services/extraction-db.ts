import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { MaterialExtraction, ProcessingStatus } from "../types";
import { notifyMaterialListeners, sanitizeForFirestore } from "./material-db";

const LOCAL_STORAGE_EXTRACTIONS_KEY = "alfassa_extractions_cache";

const extractionListeners = new Map<string, Set<(extraction: MaterialExtraction | null) => void>>();

export function notifyExtractionListeners(materialId: string, extraction: MaterialExtraction | null): void {
  const set = extractionListeners.get(materialId);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(extraction);
      } catch (err) {
        console.warn("Error in extraction listener:", err);
      }
    });
  }
}

export function getCachedExtractions(userId: string): MaterialExtraction[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_EXTRACTIONS_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getExtractionsForUser(userId: string): Promise<MaterialExtraction[]> {
  return getCachedExtractions(userId);
}

function saveCachedExtractions(userId: string, extractions: MaterialExtraction[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_EXTRACTIONS_KEY}_${userId}`, JSON.stringify(extractions));
  } catch (err) {
    console.warn("Local extractions cache write error:", err);
  }
}

/**
 * Saves or updates an Extraction entity
 */
export async function saveExtractionToDb(extraction: MaterialExtraction): Promise<void> {
  // Update local cache
  const existing = getCachedExtractions(extraction.userId);
  const updated = [
    extraction,
    ...existing.filter((e) => e.id !== extraction.id && e.materialId !== extraction.materialId),
  ];
  saveCachedExtractions(extraction.userId, updated);

  // Synchronize Material processing status in both local cache and Firestore
  await updateMaterialProcessingStatus(extraction.materialId, extraction.userId, extraction.processingStatus);

  // Notify active extraction listeners immediately
  notifyExtractionListeners(extraction.materialId, extraction);

  // Sync to Firestore if authenticated
  if (auth.currentUser && !extraction.userId.startsWith("guest-")) {
    try {
      const sanitized = sanitizeForFirestore(extraction);
      await setDoc(doc(db, "extractions", extraction.id), sanitized);
    } catch (error) {
      console.warn("Firestore saveExtraction failed, preserved in local cache:", error);
    }
  }
}

/**
 * Updates a Material's processing status in both local cache and Firestore
 */
export async function updateMaterialProcessingStatus(
  materialId: string,
  userId: string,
  status: ProcessingStatus
): Promise<void> {
  // Update in local materials cache
  try {
    const key = `alfassa_materials_cache_${userId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list = JSON.parse(raw);
      const updatedList = list.map((m: any) => 
        m.id === materialId ? { ...m, processingStatus: status, updatedAt: new Date().toISOString() } : m
      );
      localStorage.setItem(key, JSON.stringify(updatedList));
      notifyMaterialListeners(userId, updatedList);
    }
  } catch (err) {
    console.warn("Could not update local material cache status:", err);
  }

  // Update in Firestore
  if (auth.currentUser && !userId.startsWith("guest-")) {
    try {
      await updateDoc(doc(db, "materials", materialId), {
        processingStatus: status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Firestore material status update failed:", err);
    }
  }
}

/**
 * Retrieves the extraction record for a specific material
 */
export function getCachedExtractionByMaterialId(
  materialId: string,
  userId: string
): MaterialExtraction | null {
  const cached = getCachedExtractions(userId);
  return cached.find((e) => e.materialId === materialId) || null;
}

/**
 * Subscribes to real-time updates for a single material's extraction
 */
export function subscribeToExtraction(
  materialId: string,
  userId: string,
  onUpdate: (extraction: MaterialExtraction | null) => void
): () => void {
  // Emit local cache immediately
  const cached = getCachedExtractionByMaterialId(materialId, userId);
  onUpdate(cached);

  // Register local listener
  if (!extractionListeners.has(materialId)) {
    extractionListeners.set(materialId, new Set());
  }
  const set = extractionListeners.get(materialId)!;
  set.add(onUpdate);

  const localUnsub = () => {
    set.delete(onUpdate);
  };

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return localUnsub;
  }

  const q = query(
    collection(db, "extractions"),
    where("materialId", "==", materialId),
    where("userId", "==", userId)
  );

  const firestoreUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as MaterialExtraction;
        onUpdate(data);
      } else {
        onUpdate(getCachedExtractionByMaterialId(materialId, userId));
      }
    },
    (error) => {
      console.warn("Subscription error for extraction, using local cache:", error);
      onUpdate(getCachedExtractionByMaterialId(materialId, userId));
    }
  );

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}
