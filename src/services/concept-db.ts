import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { Concept, ConceptVersion, KnowledgeRelationship } from "../types";

const LOCAL_STORAGE_CONCEPTS_KEY = "alfassa_concepts_cache";
const LOCAL_STORAGE_CONCEPT_VERSIONS_KEY = "alfassa_concept_versions_cache";
const LOCAL_STORAGE_RELATIONSHIPS_KEY = "alfassa_relationships_cache";

function getCachedConcepts(userId: string): Concept[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CONCEPTS_KEY}_${userId}`);
    if (!raw) {
      return [];
    }
    const parsed: Concept[] = JSON.parse(raw);
    // Sanitize any legacy fake seed concepts if they lack real sources
    return parsed.filter(
      (c) => !(c.id === "cpt_lens_anatomy" || c.id === "cpt_focal_length") || (c.sourceMaterialIds && c.sourceMaterialIds.length > 0)
    );
  } catch {
    return [];
  }
}

function saveCachedConcepts(userId: string, concepts: Concept[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_CONCEPTS_KEY}_${userId}`, JSON.stringify(concepts));
  } catch (err) {
    console.warn("Could not save concepts to local storage:", err);
  }
}

function getCachedConceptVersions(conceptId: string): ConceptVersion[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CONCEPT_VERSIONS_KEY}_${conceptId}`);
    if (!raw) return [];
    const parsed: ConceptVersion[] = JSON.parse(raw);
    return parsed.sort((a, b) => b.version - a.version);
  } catch {
    return [];
  }
}

function saveCachedConceptVersions(conceptId: string, versions: ConceptVersion[]): void {
  try {
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    localStorage.setItem(`${LOCAL_STORAGE_CONCEPT_VERSIONS_KEY}_${conceptId}`, JSON.stringify(sorted));
  } catch (err) {
    console.warn("Could not save concept versions to local storage:", err);
  }
}

export function getCachedRelationships(userId: string): KnowledgeRelationship[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_RELATIONSHIPS_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCachedRelationships(userId: string, rels: KnowledgeRelationship[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_RELATIONSHIPS_KEY}_${userId}`, JSON.stringify(rels));
  } catch (err) {
    console.warn("Could not save relationships to local storage:", err);
  }
}

/**
 * Saves or updates a Concept entity, appending a new ConceptVersion record for auditability
 */
export async function saveConceptWithVersion(
  concept: Concept,
  changeReason: string,
  sourceMaterialId?: string,
  reviewId?: string
): Promise<{ concept: Concept; version: ConceptVersion }> {
  const versionNumber = concept.currentVersion;
  const versionId = `cptver_${concept.id}_v${versionNumber}_${Date.now()}`;

  const newVersion: ConceptVersion = {
    id: versionId,
    conceptId: concept.id,
    version: versionNumber,
    userId: concept.userId,
    title: concept.title,
    summary: concept.summary,
    content: concept.content,
    changeReason,
    sourceMaterialId,
    reviewId,
    createdAt: new Date().toISOString(),
  };

  // 1. Update local cache
  const existingConcepts = getCachedConcepts(concept.userId);
  const updatedConcepts = [concept, ...existingConcepts.filter((c) => c.id !== concept.id)];
  saveCachedConcepts(concept.userId, updatedConcepts);

  const existingVersions = getCachedConceptVersions(concept.id);
  saveCachedConceptVersions(concept.id, [newVersion, ...existingVersions]);

  // 2. Persist to Firestore if authenticated
  if (auth.currentUser && !concept.userId.startsWith("guest-")) {
    try {
      await setDoc(doc(db, "concepts", concept.id), concept);
      await setDoc(doc(db, "concept_versions", versionId), newVersion);
    } catch (err) {
      console.warn("Firestore saveConceptWithVersion error:", err);
    }
  }

  return { concept, version: newVersion };
}

/**
 * Saves confirmed knowledge relationships
 */
export async function saveKnowledgeRelationships(
  relationships: KnowledgeRelationship[]
): Promise<void> {
  if (relationships.length === 0) return;
  const userId = relationships[0].userId;

  const existing = getCachedRelationships(userId);
  const newMap = new Map(existing.map((r) => [r.id, r]));
  for (const r of relationships) {
    newMap.set(r.id, r);
  }
  saveCachedRelationships(userId, Array.from(newMap.values()));

  if (auth.currentUser && !userId.startsWith("guest-")) {
    for (const r of relationships) {
      try {
        await setDoc(doc(db, "knowledge_relationships", r.id), r);
      } catch (err) {
        console.warn("Firestore saveKnowledgeRelationship error:", err);
      }
    }
  }
}

/**
 * Retrieves all concepts for a user
 */
export async function getConceptsForUser(userId: string): Promise<Concept[]> {
  const cached = getCachedConcepts(userId);
  if (!auth.currentUser || userId.startsWith("guest-")) {
    return cached;
  }

  try {
    const q = query(collection(db, "concepts"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const remote: Concept[] = [];
      snapshot.forEach((snap) => remote.push(snap.data() as Concept));
      saveCachedConcepts(userId, remote);
      return remote;
    }
  } catch (err) {
    console.warn("Could not fetch remote concepts:", err);
  }
  return cached;
}

/**
 * Subscribes to real-time concepts updates
 */
export function subscribeToUserConcepts(
  userId: string,
  onUpdate: (concepts: Concept[]) => void
): () => void {
  const cached = getCachedConcepts(userId);
  onUpdate(cached);

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return () => {};
  }

  const q = query(collection(db, "concepts"), where("userId", "==", userId));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const concepts: Concept[] = [];
      snapshot.forEach((snap) => concepts.push(snap.data() as Concept));
      saveCachedConcepts(userId, concepts);
      onUpdate(concepts);
    },
    (err) => {
      console.warn("Concepts subscription error:", err);
      onUpdate(getCachedConcepts(userId));
    }
  );

  return unsubscribe;
}

/**
 * Subscribes to versions for a concept
 */
export function subscribeToConceptVersions(
  conceptId: string,
  onUpdate: (versions: ConceptVersion[]) => void
): () => void {
  const cached = getCachedConceptVersions(conceptId);
  onUpdate(cached);

  if (!auth.currentUser) {
    return () => {};
  }

  const q = query(collection(db, "concept_versions"), where("conceptId", "==", conceptId));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const versions: ConceptVersion[] = [];
      snapshot.forEach((snap) => versions.push(snap.data() as ConceptVersion));
      versions.sort((a, b) => b.version - a.version);
      saveCachedConceptVersions(conceptId, versions);
      onUpdate(versions);
    },
    (err) => {
      console.warn("Concept versions subscription error:", err);
      onUpdate(getCachedConceptVersions(conceptId));
    }
  );

  return unsubscribe;
}

/**
 * Subscribes to confirmed relationships for a user
 */
export function subscribeToKnowledgeRelationships(
  userId: string,
  onUpdate: (relationships: KnowledgeRelationship[]) => void
): () => void {
  const cached = getCachedRelationships(userId);
  onUpdate(cached);

  if (!auth.currentUser || userId.startsWith("guest-")) {
    return () => {};
  }

  const q = query(collection(db, "knowledge_relationships"), where("userId", "==", userId));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const list: KnowledgeRelationship[] = [];
      snapshot.forEach((snap) => list.push(snap.data() as KnowledgeRelationship));
      saveCachedRelationships(userId, list);
      onUpdate(list);
    },
    (err) => {
      console.warn("Relationships subscription error:", err);
      onUpdate(getCachedRelationships(userId));
    }
  );

  return unsubscribe;
}

/**
 * Retrieves a single concept by ID
 */
export async function getConceptById(
  conceptId: string,
  userId: string
): Promise<Concept | null> {
  const cached = getCachedConcepts(userId);
  const found = cached.find((c) => c.id === conceptId);
  if (found) return found;

  if (auth.currentUser && !userId.startsWith("guest-")) {
    try {
      const snap = await getDoc(doc(db, "concepts", conceptId));
      if (snap.exists()) {
        const data = snap.data() as Concept;
        return data;
      }
    } catch (err) {
      console.warn("Firestore getConceptById error:", err);
    }
  }
  return null;
}

/**
 * Retrieves versions for a concept
 */
export async function getConceptVersions(conceptId: string): Promise<ConceptVersion[]> {
  const cached = getCachedConceptVersions(conceptId);
  if (cached.length > 0 || !auth.currentUser) {
    return cached;
  }

  try {
    const q = query(collection(db, "concept_versions"), where("conceptId", "==", conceptId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const remote: ConceptVersion[] = [];
      snapshot.forEach((s) => remote.push(s.data() as ConceptVersion));
      remote.sort((a, b) => b.version - a.version);
      saveCachedConceptVersions(conceptId, remote);
      return remote;
    }
  } catch (err) {
    console.warn("Firestore getConceptVersions error:", err);
  }
  return cached;
}

/**
 * Adds a single knowledge relationship
 */
export async function addKnowledgeRelationship(
  relationship: KnowledgeRelationship
): Promise<void> {
  await saveKnowledgeRelationships([relationship]);
}

/**
 * Deletes a knowledge relationship by ID
 */
export async function deleteKnowledgeRelationship(
  relationshipId: string,
  userId: string
): Promise<void> {
  const existing = getCachedRelationships(userId);
  const updated = existing.filter((r) => r.id !== relationshipId);
  saveCachedRelationships(userId, updated);

  if (auth.currentUser && !userId.startsWith("guest-")) {
    try {
      await deleteDoc(doc(db, "knowledge_relationships", relationshipId));
    } catch (err) {
      console.warn("Firestore deleteKnowledgeRelationship error:", err);
    }
  }
}

/**
 * Deletes a concept by ID
 */
export async function deleteConcept(
  conceptId: string,
  userId: string
): Promise<void> {
  const existing = getCachedConcepts(userId);
  const updated = existing.filter((c) => c.id !== conceptId);
  saveCachedConcepts(userId, updated);

  if (auth.currentUser && !userId.startsWith("guest-")) {
    try {
      await deleteDoc(doc(db, "concepts", conceptId));
    } catch (err) {
      console.warn("Firestore deleteConcept error:", err);
    }
  }
}
