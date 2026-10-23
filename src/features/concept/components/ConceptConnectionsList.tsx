import React, { useState, useMemo } from "react";
import { Material, Concept, MaterialExtraction, KnowledgeRelationship, KnowledgeRelationType } from "../../../types";
import { Link2, Sparkles, FileText, ArrowUpRight, Check, X, BookOpen, ExternalLink, ShieldCheck } from "lucide-react";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";

export interface ProposedConnectionCandidate {
  id: string;
  targetType: "material" | "concept";
  targetId: string;
  targetTitle: string;
  relationType: KnowledgeRelationType;
  evidenceExcerpt: string;
  evidenceRationale: string;
  materialType?: string;
}

interface ConceptConnectionsListProps {
  currentConcept: Concept;
  allMaterials: Material[];
  allConcepts?: Concept[];
  extractionsMap: Record<string, MaterialExtraction>;
  existingRelationships?: KnowledgeRelationship[];
  onAddRelationship?: (rel: {
    targetConceptId: string;
    targetTitle: string;
    relationType: KnowledgeRelationType;
    description?: string;
  }) => Promise<void>;
  onSelectMaterial?: (materialId: string) => void;
  onSelectConcept?: (conceptId: string) => void;
}

export function ConceptConnectionsList({
  currentConcept,
  allMaterials,
  allConcepts = [],
  extractionsMap,
  existingRelationships = [],
  onAddRelationship,
  onSelectMaterial,
  onSelectConcept,
}: ConceptConnectionsListProps) {
  const [dismissedCandidateIds, setDismissedCandidateIds] = useState<Set<string>>(new Set());
  const [confirmCandidate, setConfirmCandidate] = useState<ProposedConnectionCandidate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Discover genuine evidence-grounded candidates
  const candidates = useMemo(() => {
    const list: ProposedConnectionCandidate[] = [];
    const conceptTitleLower = currentConcept.title.toLowerCase();

    // Existing target concept IDs already linked
    const existingLinkedConceptIds = new Set(
      existingRelationships.map((r) => r.targetConceptId)
    );

    // 1. Material Content Evidence Discovery
    for (const mat of allMaterials) {
      const candidateId = `conn-mat-${mat.id}-${currentConcept.id}`;
      if (dismissedCandidateIds.has(candidateId)) continue;

      let matchText = "";
      let rationale = "";

      const extraction = extractionsMap[mat.id];
      const fullText = (
        (mat.title || "") + " " +
        (extraction?.extractedText || "") + " " +
        (extraction?.transcriptResult?.text || "") + " " +
        (extraction?.ocrResult?.text || "") + " " +
        (extraction?.webResult?.pageText || "")
      );

      const idx = fullText.toLowerCase().indexOf(conceptTitleLower);
      if (idx !== -1) {
        // Extract 120 character excerpt surrounding match
        const start = Math.max(0, idx - 40);
        const end = Math.min(fullText.length, idx + conceptTitleLower.length + 80);
        matchText = (start > 0 ? "..." : "") + fullText.substring(start, end).trim() + (end < fullText.length ? "..." : "");
        rationale = `Extracted content directly mentions "${currentConcept.title}"`;
      } else if (mat.title.toLowerCase().includes(conceptTitleLower)) {
        matchText = `Material title matches "${currentConcept.title}"`;
        rationale = "Material title directly references concept";
      }

      if (matchText) {
        list.push({
          id: candidateId,
          targetType: "material",
          targetId: mat.id,
          targetTitle: mat.title,
          relationType: "relates_to",
          evidenceExcerpt: matchText,
          evidenceRationale: rationale,
          materialType: mat.type,
        });
      }
    }

    // 2. Concept Evidence Discovery
    for (const otherConcept of allConcepts) {
      if (otherConcept.id === currentConcept.id) continue;
      if (existingLinkedConceptIds.has(otherConcept.id)) continue;

      const candidateId = `conn-concept-${otherConcept.id}-${currentConcept.id}`;
      if (dismissedCandidateIds.has(candidateId)) continue;

      const otherTitleLower = otherConcept.title.toLowerCase();
      const currentContentLower = (currentConcept.summary + " " + (currentConcept.content || "")).toLowerCase();
      const otherContentLower = (otherConcept.summary + " " + (otherConcept.content || "")).toLowerCase();

      let isMatch = false;
      let excerpt = "";
      let rationale = "";

      if (currentContentLower.includes(otherTitleLower)) {
        isMatch = true;
        excerpt = `Concept knowledge text references "${otherConcept.title}"`;
        rationale = "Direct reference within concept document text";
      } else if (otherContentLower.includes(conceptTitleLower)) {
        isMatch = true;
        excerpt = `"${otherConcept.title}" knowledge text references "${currentConcept.title}"`;
        rationale = "Mutual concept documentation alignment";
      }

      if (isMatch) {
        list.push({
          id: candidateId,
          targetType: "concept",
          targetId: otherConcept.id,
          targetTitle: otherConcept.title,
          relationType: "relates_to",
          evidenceExcerpt: excerpt,
          evidenceRationale: rationale,
        });
      }
    }

    return list;
  }, [currentConcept, allMaterials, allConcepts, extractionsMap, existingRelationships, dismissedCandidateIds]);

  // Handle Accept Connection Proposal
  const handleAcceptConnection = async () => {
    if (!confirmCandidate || !onAddRelationship) return;
    setIsSubmitting(true);
    try {
      let targetConceptId = confirmCandidate.targetId;

      // If target is a material, ensure or use target concept ID or connect
      if (confirmCandidate.targetType === "concept") {
        await onAddRelationship({
          targetConceptId: confirmCandidate.targetId,
          targetTitle: confirmCandidate.targetTitle,
          relationType: confirmCandidate.relationType,
          description: confirmCandidate.evidenceRationale,
        });
      } else {
        // If material, connect to existing matching concept or record grounding
        const matchingConcept = allConcepts.find(
          (c) => c.title.toLowerCase() === confirmCandidate.targetTitle.toLowerCase()
        );
        if (matchingConcept) {
          await onAddRelationship({
            targetConceptId: matchingConcept.id,
            targetTitle: matchingConcept.title,
            relationType: confirmCandidate.relationType,
            description: `Grounded via material: ${confirmCandidate.targetTitle}`,
          });
        }
      }

      // Dismiss candidate after creation
      setDismissedCandidateIds((prev) => new Set(prev).add(confirmCandidate.id));
      setConfirmCandidate(null);
    } catch (err) {
      console.error("Failed accepting connection:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject Connection Proposal
  const handleRejectCandidate = (candidateId: string) => {
    setDismissedCandidateIds((prev) => new Set(prev).add(candidateId));
  };

  return (
    <div className="bg-bg-surface border border-border-color rounded-2xl p-5 shadow-2xs space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-border-color pb-3">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-text-primary" />
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Connections
          </h3>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-bg-subtle text-text-muted border border-border-color">
          {candidates.length}
        </span>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        Evidence-grounded links discovered between workspace materials and concepts.
      </p>

      {/* Candidates List or Restrained Empty State */}
      {candidates.length === 0 ? (
        <div className="p-4 rounded-xl bg-bg-subtle/50 border border-border-color/60 text-center space-y-1">
          <Sparkles size={16} className="mx-auto text-text-muted" />
          <p className="text-xs font-medium text-text-primary">No new connection candidates</p>
          <p className="text-[11px] text-text-muted">
            All evidence-grounded material and concept links are established or reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((cand) => (
            <div
              key={cand.id}
              className="p-3.5 rounded-xl bg-bg-subtle/40 border border-border-color space-y-2.5 transition-all"
            >
              {/* Target Header & Open Link */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-md bg-bg-surface border border-border-color shrink-0 text-text-primary">
                    {cand.targetType === "concept" ? <BookOpen size={14} /> : <FileText size={14} />}
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (cand.targetType === "concept") {
                          onSelectConcept?.(cand.targetId);
                        } else {
                          onSelectMaterial?.(cand.targetId);
                        }
                      }}
                      className="text-xs font-semibold text-text-primary hover:underline truncate block text-left cursor-pointer"
                    >
                      {cand.targetTitle}
                    </button>
                    <span className="text-[10px] text-text-muted capitalize block">
                      {cand.targetType === "concept" ? "Accepted Concept" : `${cand.materialType || "Material"}`}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (cand.targetType === "concept") {
                      onSelectConcept?.(cand.targetId);
                    } else {
                      onSelectMaterial?.(cand.targetId);
                    }
                  }}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                  title="View Target"
                >
                  <ArrowUpRight size={14} />
                </button>
              </div>

              {/* Supporting Evidence Excerpt */}
              <div className="p-2.5 rounded-lg bg-bg-surface border border-border-color/60 text-[11px] space-y-1">
                <div className="flex items-center gap-1 font-semibold text-text-secondary">
                  <ShieldCheck size={12} className="text-text-primary shrink-0" />
                  <span>Evidence:</span>
                  <span className="font-normal text-text-muted truncate">{cand.evidenceRationale}</span>
                </div>
                <p className="text-text-muted italic line-clamp-2 leading-relaxed">
                  "{cand.evidenceExcerpt}"
                </p>
              </div>

              {/* Accept & Reject Action Bar */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border-color/40">
                <button
                  type="button"
                  onClick={() => handleRejectCandidate(cand.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                  title="Dismiss Candidate"
                >
                  <X size={12} />
                  <span>Dismiss</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCandidate(cand)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-semibold bg-text-primary text-bg-surface hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
                >
                  <Check size={12} />
                  <span>Accept Connection</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog before establishing permanent relationship */}
      {confirmCandidate && (
        <ConfirmDialog
          isOpen={!!confirmCandidate}
          title="Confirm Connection"
          message={`Establish a permanent relationship with "${confirmCandidate.targetTitle}" based on workspace evidence?`}
          confirmText="Confirm Relationship"
          onConfirm={handleAcceptConnection}
          onCancel={() => setConfirmCandidate(null)}
        />
      )}
    </div>
  );
}
