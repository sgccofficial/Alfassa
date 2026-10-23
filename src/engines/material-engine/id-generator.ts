/**
 * Stable ID Generator for Alfassa.
 * Conforms strictly to Sprint 0A Architecture guidelines:
 * - mat_... (Material)
 * - act_... (Activity)
 * - wsp_... (Workspace)
 * - con_... (Concept)
 * - usr_... (User)
 */

function generateRandomSuffix(length = 16): string {
  // Use crypto.randomUUID if available or crypto.getRandomValues
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").substring(0, length);
  }
  return Math.random().toString(36).substring(2, 2 + length);
}

export function generateMaterialId(): string {
  return `mat_${generateRandomSuffix(20)}`;
}

export function generateActivityId(): string {
  return `act_${generateRandomSuffix(20)}`;
}

export function generateWorkspaceId(userId?: string): string {
  if (userId) {
    // Deterministic or clean workspace ID for default workspace
    const cleanUid = userId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
    return `wsp_${cleanUid}`;
  }
  return `wsp_${generateRandomSuffix(16)}`;
}
