import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { Material, Activity } from "../types";

export const LOCAL_STORAGE_MATERIALS_KEY = "alfassa_materials_cache";
export const LOCAL_STORAGE_ACTIVITIES_KEY = "alfassa_activities_cache";

/**
 * Local cache helpers for graceful offline / guest mode support
 */
export function getCachedMaterials(userId: string): Material[] {
  try {
    const list: Material[] = [];
    const seen = new Set<string>();

    // 1. Check primary key for current user
    const raw = localStorage.getItem(`${LOCAL_STORAGE_MATERIALS_KEY}_${userId}`);
    if (raw) {
      try {
        const parsed: Material[] = JSON.parse(raw);
        for (const m of parsed) {
          if (m && m.id && !seen.has(m.id)) {
            seen.add(m.id);
            list.push(m);
          }
        }
      } catch {}
    }

    // 2. If guest user or re-initializing: scan any other guest or default caches
    if (userId.startsWith("guest") || userId === "guest-user") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_STORAGE_MATERIALS_KEY) && k !== `${LOCAL_STORAGE_MATERIALS_KEY}_${userId}`) {
          try {
            const guestItems: Material[] = JSON.parse(localStorage.getItem(k) || "[]");
            for (const item of guestItems) {
              if (item && item.id && !seen.has(item.id)) {
                seen.add(item.id);
                list.push(item);
              }
            }
          } catch {}
        }
      }
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch {
    return [];
  }
}

/**
 * Retrieves a material by ID from cache or Firestore
 */
export async function getMaterialFromDb(materialId: string, userId?: string): Promise<Material | null> {
  if (userId) {
    const cached = getCachedMaterials(userId);
    const found = cached.find((m) => m.id === materialId);
    if (found) return found;
  }

  // Scan all local storage material caches if user not known or not in cache
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_MATERIALS_KEY)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list: Material[] = JSON.parse(raw);
          const found = list.find((m) => m.id === materialId);
          if (found) return found;
        }
      }
    }
  } catch (err) {
    console.warn("Error searching local materials cache:", err);
  }

  // Check Firestore if online
  if (auth.currentUser) {
    try {
      const docSnap = await getDoc(doc(db, "materials", materialId));
      if (docSnap.exists()) {
        return docSnap.data() as Material;
      }
    } catch (err) {
      console.warn("Firestore getMaterial failed:", err);
    }
  }

  return null;
}

const materialListeners = new Map<string, Set<(materials: Material[]) => void>>();
const activityListeners = new Map<string, Set<(activities: Activity[]) => void>>();

export function notifyMaterialListeners(userId: string, materials?: Material[]): void {
  const current = materials || getCachedMaterials(userId);
  const set = materialListeners.get(userId);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(current);
      } catch (err) {
        console.warn("Error in material listener:", err);
      }
    });
  }
}

export function notifyActivityListeners(userId: string, activities?: Activity[]): void {
  const current = activities || getCachedActivities(userId);
  const set = activityListeners.get(userId);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(current);
      } catch (err) {
        console.warn("Error in activity listener:", err);
      }
    });
  }
}

export function saveCachedMaterials(userId: string, materials: Material[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_MATERIALS_KEY}_${userId}`, JSON.stringify(materials));
    notifyMaterialListeners(userId, materials);
  } catch (err: any) {
    console.warn("Local storage write error, attempting stripped save to preserve records:", err);
    try {
      // If quota exceeded, strip large preview dataUrls/blobs so metadata is never dropped
      const stripped = materials.map((m) => ({
        ...m,
        originalInput: {
          ...m.originalInput,
          dataUrl: undefined,
          rawContent: m.originalInput?.rawContent && m.originalInput.rawContent.length > 50000 
            ? m.originalInput.rawContent.slice(0, 50000) 
            : m.originalInput?.rawContent,
        },
      }));
      localStorage.setItem(`${LOCAL_STORAGE_MATERIALS_KEY}_${userId}`, JSON.stringify(stripped));
      notifyMaterialListeners(userId, stripped);
    } catch (fallbackErr) {
      console.error("Local storage quota completely exhausted; keeping in-memory:", fallbackErr);
      notifyMaterialListeners(userId, materials);
    }
  }
}

export function getCachedActivities(userId: string): Activity[] {
  try {
    const list: Activity[] = [];
    const seen = new Set<string>();

    const raw = localStorage.getItem(`${LOCAL_STORAGE_ACTIVITIES_KEY}_${userId}`);
    if (raw) {
      try {
        const parsed: Activity[] = JSON.parse(raw);
        for (const a of parsed) {
          if (a && a.id && !seen.has(a.id)) {
            seen.add(a.id);
            list.push(a);
          }
        }
      } catch {}
    }

    if (userId.startsWith("guest") || userId === "guest-user") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_STORAGE_ACTIVITIES_KEY) && k !== `${LOCAL_STORAGE_ACTIVITIES_KEY}_${userId}`) {
          try {
            const guestActs: Activity[] = JSON.parse(localStorage.getItem(k) || "[]");
            for (const item of guestActs) {
              if (item && item.id && !seen.has(item.id)) {
                seen.add(item.id);
                list.push(item);
              }
            }
          } catch {}
        }
      }
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch {
    return [];
  }
}

export function saveCachedActivities(userId: string, activities: Activity[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_ACTIVITIES_KEY}_${userId}`, JSON.stringify(activities));
    notifyActivityListeners(userId, activities);
  } catch (err) {
    console.warn("Local storage write error for activities:", err);
    notifyActivityListeners(userId, activities);
  }
}

/**
 * Sanitizes an object before writing to Firestore by removing undefined keys
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore) as any;
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Saves a Material entity to Firestore (with local cache fallback)
 */
export async function saveMaterialToDb(material: Material): Promise<void> {
  const path = `materials/${material.id}`;

  // Always update local cache immediately for snappy UI
  const existing = getCachedMaterials(material.userId);
  const updated = [material, ...existing.filter((m) => m.id !== material.id)];
  saveCachedMaterials(material.userId, updated);

  // If user is authenticated in Firebase, persist to Firestore
  if (auth.currentUser && !material.userId.startsWith("guest-")) {
    try {
      const sanitized = sanitizeForFirestore(material);
      await setDoc(doc(db, "materials", material.id), sanitized);
    } catch (error) {
      console.warn("Firestore saveMaterial failed, saved to local cache:", error);
      // Non-fatal fallback: local cache already saved
    }
  }
}

/**
 * Saves an Activity entity to Firestore (with local cache fallback)
 */
export async function saveActivityToDb(activity: Activity): Promise<void> {
  const path = `activities/${activity.id}`;

  // Update local cache
  const existing = getCachedActivities(activity.userId);
  const updated = [activity, ...existing.filter((a) => a.id !== activity.id)];
  saveCachedActivities(activity.userId, updated);

  if (auth.currentUser && !activity.userId.startsWith("guest-")) {
    try {
      const sanitized = sanitizeForFirestore(activity);
      await setDoc(doc(db, "activities", activity.id), sanitized);
    } catch (error) {
      console.warn("Firestore saveActivity failed, saved to local cache:", error);
    }
  }
}

/**
 * Subscribes to real-time materials for a given user
 */
export function subscribeToUserMaterials(
  userId: string,
  onMaterialsUpdate: (materials: Material[]) => void
): () => void {
  // Emit initial local cache immediately
  const cached = getCachedMaterials(userId);
  onMaterialsUpdate(cached);

  // Register in local listener set
  if (!materialListeners.has(userId)) {
    materialListeners.set(userId, new Set());
  }
  const set = materialListeners.get(userId)!;
  set.add(onMaterialsUpdate);

  const localUnsub = () => {
    set.delete(onMaterialsUpdate);
  };

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return localUnsub;
  }

  const materialsQuery = query(
    collection(db, "materials"),
    where("userId", "==", userId)
  );

  const firestoreUnsub = onSnapshot(
    materialsQuery,
    (snapshot) => {
      const firestoreMaterials: Material[] = [];
      snapshot.forEach((docSnap) => {
        firestoreMaterials.push(docSnap.data() as Material);
      });
      // Retain any locally cached materials that have not yet synced to Firestore,
      // and keep local version if it is currently saving/uploading or has newer timestamp
      const currentLocal = getCachedMaterials(userId);
      const localMap = new Map(currentLocal.map((m) => [m.id, m]));
      const firestoreIds = new Set(firestoreMaterials.map((m) => m.id));

      const merged = firestoreMaterials.map((fm) => {
        const local = localMap.get(fm.id);
        if (local) {
          if (local.status === "saving" || local.status === "uploading") {
            return local;
          }
          if (new Date(local.updatedAt).getTime() > new Date(fm.updatedAt).getTime()) {
            return local;
          }
        }
        return fm;
      });

      const unsynced = currentLocal.filter((m) => !firestoreIds.has(m.id));
      const combined = [...merged, ...unsynced];

      // Sort newest first
      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      saveCachedMaterials(userId, combined);
      onMaterialsUpdate(combined);
    },
    (error) => {
      console.warn("Subscription error for materials, using cache:", error);
      onMaterialsUpdate(getCachedMaterials(userId));
    }
  );

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

/**
 * Subscribes to real-time activities for a given user
 */
export function subscribeToUserActivities(
  userId: string,
  onActivitiesUpdate: (activities: Activity[]) => void
): () => void {
  // Emit initial local cache immediately
  const cached = getCachedActivities(userId);
  onActivitiesUpdate(cached);

  // Register in local listener set
  if (!activityListeners.has(userId)) {
    activityListeners.set(userId, new Set());
  }
  const set = activityListeners.get(userId)!;
  set.add(onActivitiesUpdate);

  const localUnsub = () => {
    set.delete(onActivitiesUpdate);
  };

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return localUnsub;
  }

  const activitiesQuery = query(
    collection(db, "activities"),
    where("userId", "==", userId)
  );

  const firestoreUnsub = onSnapshot(
    activitiesQuery,
    (snapshot) => {
      const firestoreActivities: Activity[] = [];
      snapshot.forEach((docSnap) => {
        firestoreActivities.push(docSnap.data() as Activity);
      });
      // Retain any locally cached activities that have not yet synced
      const currentLocal = getCachedActivities(userId);
      const firestoreIds = new Set(firestoreActivities.map((a) => a.id));
      const unsynced = currentLocal.filter((a) => !firestoreIds.has(a.id));
      const combined = [...firestoreActivities, ...unsynced];

      // Sort newest first
      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      saveCachedActivities(userId, combined);
      onActivitiesUpdate(combined);
    },
    (error) => {
      console.warn("Subscription error for activities, using cache:", error);
      onActivitiesUpdate(getCachedActivities(userId));
    }
  );

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}
export async function deleteMaterialFromDb(materialId: string, userId: string): Promise<void> {
  const path = `materials/${materialId}`;

  // Update local cache
  const existing = getCachedMaterials(userId);
  const updated = existing.filter((m) => m.id !== materialId);
  saveCachedMaterials(userId, updated);

  if (auth.currentUser && !userId.startsWith("guest-")) {
    try {
      await deleteDoc(doc(db, "materials", materialId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}
