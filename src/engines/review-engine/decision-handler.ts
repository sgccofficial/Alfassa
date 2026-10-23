import {
  WorkspaceReview,
  Concept,
  ConceptVersion,
  KnowledgeRelationship,
  KnowledgeRelationType,
  UserDecisionRecord,
  Activity,
} from "../../types";
import { 
  saveConceptWithVersion, 
  saveKnowledgeRelationships, 
  getConceptsForUser,
  getCachedRelationships
} from "../../services/concept-db";
import { saveWorkspaceReview } from "../../services/review-db";
import { saveActivityToDb } from "../../services/material-db";

export interface DecisionOptions {
  action: "merged" | "kept_separate" | "reviewed";
  targetConceptId?: string;
  targetConceptIds?: string[];
  finalTitle: string;
  finalSummary: string;
  finalContent: string;
  relationships: Array<{
    targetConceptId?: string;
    targetTitle: string;
    relationType: KnowledgeRelationType;
    notes?: string;
  }>;
  userNotes?: string;
  extractedVersionSnapshot: {
    extractionId: string;
    pathwayUsed: string;
    completedAt?: string;
  };
}

export interface DecisionExecutionResult {
  review: WorkspaceReview;
  concept: Concept;
  version: ConceptVersion;
  relationships: KnowledgeRelationship[];
}

/**
 * Executes a definitive user review decision (MERGE, KEEP SEPARATE, or REVIEW edit).
 *
 * Strict Guarantees:
 * 1. Historical concept versions are never destructively mutated; a new immutable version is always created.
 * 2. An auditable UserDecisionRecord is attached to the review object.
 * 3. An activity log event is recorded.
 * 4. User decisions are explicitly confirmed and cannot be automatically applied without human action.
 */
export async function executeReviewDecision(
  review: WorkspaceReview,
  options: DecisionOptions
): Promise<DecisionExecutionResult> {
  const now = new Date().toISOString();
  let resultingConcept: Concept;
  let changeReason: string;

  const existingConcepts = await getConceptsForUser(review.userId);
  const targetIds = options.targetConceptIds && options.targetConceptIds.length > 0
    ? options.targetConceptIds
    : options.targetConceptId
    ? [options.targetConceptId]
    : [];

  const targetConcepts = existingConcepts.filter((c) => targetIds.includes(c.id));
  const primaryTarget = targetConcepts[0] || (options.targetConceptId ? existingConcepts.find((c) => c.id === options.targetConceptId) : undefined);

  if (options.action === "merged") {
    if (!primaryTarget) {
      throw new Error(
        `Invalid merge target: A valid existing Knowledge Concept entity must be selected for merging. Material entities or filenames cannot be used as merge targets.`
      );
    }
    // -------------------------------------------------------------
    // DECISION: MERGE into existing concept(s)
    // -------------------------------------------------------------
    const newVersionNumber = primaryTarget.currentVersion + 1;
    changeReason = `Merged with material "${review.materialTitle}" via Workspace Review.${
      options.userNotes ? ` Notes: ${options.userNotes}` : ""
    }`;

    resultingConcept = {
      ...primaryTarget,
      title: options.finalTitle.trim() || primaryTarget.title,
      summary: options.finalSummary.trim() || primaryTarget.summary,
      content: options.finalContent.trim(),
      currentVersion: newVersionNumber,
      sourceMaterialIds: Array.from(new Set([...primaryTarget.sourceMaterialIds, review.materialId])),
      updatedAt: now,
    };

    // If multiple targets were selected, also update and version secondary target concepts
    for (const secTarget of targetConcepts.slice(1)) {
      const secVersionNumber = secTarget.currentVersion + 1;
      const secReason = `Co-merged with material "${review.materialTitle}" via Workspace Review.${
        options.userNotes ? ` Notes: ${options.userNotes}` : ""
      }`;
      const updatedSec: Concept = {
        ...secTarget,
        currentVersion: secVersionNumber,
        sourceMaterialIds: Array.from(new Set([...secTarget.sourceMaterialIds, review.materialId])),
        updatedAt: now,
      };
      await saveConceptWithVersion(updatedSec, secReason, review.materialId, review.id);
    }
  } else if (options.action === "kept_separate" || !primaryTarget) {
    // -------------------------------------------------------------
    // DECISION: KEEP SEPARATE -> creates fresh standalone Concept
    // -------------------------------------------------------------
    const newConceptId = `cpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    changeReason = options.action === "kept_separate"
      ? `Explicitly kept separate from existing knowledge. Preserved independently from material "${review.materialTitle}".`
      : `Created as new concept from material "${review.materialTitle}" via Workspace Review.`;

    resultingConcept = {
      id: newConceptId,
      userId: review.userId,
      workspaceId: review.workspaceId,
      title: options.finalTitle.trim() || review.materialTitle,
      summary: options.finalSummary.trim(),
      content: options.finalContent.trim(),
      currentVersion: 1,
      tags: [],
      sourceMaterialIds: [review.materialId],
      createdAt: now,
      updatedAt: now,
    };
  } else {
    // -------------------------------------------------------------
    // DECISION: REVIEW -> user modified existing concept
    // -------------------------------------------------------------
    const newVersionNumber = primaryTarget.currentVersion + 1;
    changeReason = `Refined via Workspace Review based on material "${review.materialTitle}".${
      options.userNotes ? ` ${options.userNotes}` : ""
    }`;

    resultingConcept = {
      ...primaryTarget,
      title: options.finalTitle.trim() || primaryTarget.title,
      summary: options.finalSummary.trim() || primaryTarget.summary,
      content: options.finalContent.trim(),
      currentVersion: newVersionNumber,
      sourceMaterialIds: Array.from(new Set([...primaryTarget.sourceMaterialIds, review.materialId])),
      updatedAt: now,
    };
  }

  // 1. Save Concept & append immutable ConceptVersion
  const { concept, version } = await saveConceptWithVersion(
    resultingConcept,
    changeReason,
    review.materialId,
    review.id
  );

  // 2. Persist confirmed knowledge relationships
  const confirmedRelationships: KnowledgeRelationship[] = [];
  const existingRelationships = await getCachedRelationships(review.userId); // Need to get existing relationships for deduplication

  for (const rel of options.relationships) {
    if (rel.targetConceptId && rel.targetConceptId !== concept.id) {
      // Check for existing relationship
      const isDuplicate = existingRelationships.some(
        (er) =>
          er.sourceConceptId === concept.id &&
          er.targetConceptId === rel.targetConceptId &&
          er.sourceMaterialId === review.materialId
      );

      if (!isDuplicate) {
        const relId = `rel_${concept.id}_${rel.targetConceptId}_${Date.now()}`;
        confirmedRelationships.push({
          id: relId,
          userId: review.userId,
          workspaceId: review.workspaceId,
          sourceConceptId: concept.id,
          targetConceptId: rel.targetConceptId,
          sourceTitle: concept.title,
          targetTitle: rel.targetTitle,
          relationType: rel.relationType,
          description: rel.notes || `Established via Workspace Review of "${review.materialTitle}"`,
          isUserConfirmed: true,
          sourceMaterialId: review.materialId,
          reviewId: review.id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  if (confirmedRelationships.length > 0) {
    await saveKnowledgeRelationships(confirmedRelationships);
  }

  // 3. Record auditable UserDecisionRecord on review
  const decisionRecord: UserDecisionRecord = {
    action: options.action,
    decidedAt: now,
    targetConceptId: primaryTarget?.id || targetIds[0],
    targetConceptIds: targetIds,
    resultingConceptId: concept.id,
    resultingConceptVersion: version.version,
    finalTitle: concept.title,
    finalSummary: concept.summary,
    finalContent: concept.content,
    finalRelationships: options.relationships,
    notes: options.userNotes,
    extractedVersionSnapshot: options.extractedVersionSnapshot,
  };

  const previousHistory = review.decisionHistory || [];
  const updatedHistory = review.userDecision 
    ? [...previousHistory, review.userDecision] 
    : previousHistory;

  const updatedReview: WorkspaceReview = {
    ...review,
    status: "resolved",
    userDecision: decisionRecord,
    decisionHistory: updatedHistory,
    updatedAt: now,
    resolvedAt: now,
  };

  await saveWorkspaceReview(updatedReview);

  // 4. Log immutable Activity record
  const isRevision = Boolean(review.userDecision);
  const activity: Activity = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: review.userId,
    workspaceId: review.workspaceId,
    type: "review_completed",
    action: "updated",
    entityId: concept.id,
    entityType: "concept",
    description: isRevision
      ? `Decision revised for "${review.materialTitle}": ${
          options.action === "merged" 
            ? "Merged into " + concept.title 
            : options.action === "kept_separate" 
            ? "Kept separate" 
            : "Reviewed as " + concept.title
        }`
      : `Workspace Review completed for "${review.materialTitle}" (${
          options.action === "merged" 
            ? "Merged into " + concept.title 
            : options.action === "kept_separate" 
            ? "Kept separate" 
            : "Reviewed as " + concept.title
        })`,
    metadata: {
      reviewId: review.id,
      materialId: review.materialId,
      action: options.action,
      version: version.version,
      isRevision,
    },
    createdAt: now,
  };
  await saveActivityToDb(activity);

  return {
    review: updatedReview,
    concept,
    version,
    relationships: confirmedRelationships,
  };
}
