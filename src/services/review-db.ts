import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { WorkspaceReview, ReviewStatus } from "../types";

const LOCAL_STORAGE_REVIEWS_KEY = "alfassa_reviews_cache";

function getCachedReviews(userId: string): WorkspaceReview[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_REVIEWS_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCachedReviews(userId: string, reviews: WorkspaceReview[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_REVIEWS_KEY}_${userId}`, JSON.stringify(reviews));
  } catch (err) {
    console.warn("Could not save reviews to local storage:", err);
  }
}

/**
 * Saves or updates a WorkspaceReview entity
 */
export async function saveWorkspaceReview(review: WorkspaceReview): Promise<void> {
  const existing = getCachedReviews(review.userId);
  const updated = [
    review,
    ...existing.filter((r) => r.id !== review.id && r.materialId !== review.materialId),
  ];
  saveCachedReviews(review.userId, updated);

  if (auth.currentUser && !review.userId.startsWith("guest-")) {
    try {
      await setDoc(doc(db, "workspace_reviews", review.id), review);
    } catch (err) {
      console.warn("Firestore saveWorkspaceReview error, stored locally:", err);
    }
  }
}

/**
 * Updates review status
 */
export async function updateReviewStatus(
  reviewId: string,
  userId: string,
  status: ReviewStatus
): Promise<void> {
  const cached = getCachedReviews(userId);
  const target = cached.find((r) => r.id === reviewId);
  if (!target) return;

  const updated: WorkspaceReview = {
    ...target,
    status,
    updatedAt: new Date().toISOString(),
    ...(status === "resolved" ? { resolvedAt: new Date().toISOString() } : {}),
  };

  await saveWorkspaceReview(updated);
}

/**
 * Retrieves a review by its materialId
 */
export function getCachedReviewByMaterialId(
  materialId: string,
  userId: string
): WorkspaceReview | null {
  const cached = getCachedReviews(userId);
  return cached.find((r) => r.materialId === materialId) || null;
}

/**
 * Retrieves a review by its reviewId
 */
export function getCachedReviewById(
  reviewId: string,
  userId: string
): WorkspaceReview | null {
  const cached = getCachedReviews(userId);
  return cached.find((r) => r.id === reviewId) || null;
}

/**
 * Subscribes to all WorkspaceReviews for a user
 */
export function subscribeToUserWorkspaceReviews(
  userId: string,
  onUpdate: (reviews: WorkspaceReview[]) => void
): () => void {
  const cached = getCachedReviews(userId);
  onUpdate(cached);

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return () => {};
  }

  const q = query(collection(db, "workspace_reviews"), where("userId", "==", userId));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const list: WorkspaceReview[] = [];
      snapshot.forEach((snap) => list.push(snap.data() as WorkspaceReview));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      saveCachedReviews(userId, list);
      onUpdate(list);
    },
    (err) => {
      console.warn("Reviews subscription error:", err);
      onUpdate(getCachedReviews(userId));
    }
  );

  return unsubscribe;
}

/**
 * Subscribes to a single review by materialId
 */
export function subscribeToReviewByMaterialId(
  materialId: string,
  userId: string,
  onUpdate: (review: WorkspaceReview | null) => void
): () => void {
  const cached = getCachedReviewByMaterialId(materialId, userId);
  onUpdate(cached);

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return () => {};
  }

  const q = query(
    collection(db, "workspace_reviews"),
    where("materialId", "==", materialId),
    where("userId", "==", userId)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (!snapshot.empty) {
        const item = snapshot.docs[0].data() as WorkspaceReview;
        onUpdate(item);
      } else {
        onUpdate(getCachedReviewByMaterialId(materialId, userId));
      }
    },
    (err) => {
      console.warn("Subscription error for single review:", err);
      onUpdate(getCachedReviewByMaterialId(materialId, userId));
    }
  );

  return unsubscribe;
}
