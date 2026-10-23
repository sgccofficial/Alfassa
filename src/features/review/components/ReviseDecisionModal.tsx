import React, { useState } from "react";
import { X, CheckCircle2, Check, History } from "lucide-react";
import { 
  WorkspaceReview, 
  Concept, 
  Material
} from "../../../types";

function formatConceptDate(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export interface ReviseDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  review?: WorkspaceReview | null;
  currentDecisionAction?: "undecided" | "kept_separate" | "merged";
  currentTargetConceptIds?: string[];
  concepts: Concept[];
  materials?: Material[];
  onSaveDecision: (
    newAction: "kept_separate" | "merged",
    newTargetConceptIds: string[]
  ) => void | Promise<void>;
  onViewHistory?: () => void;
}

export function ReviseDecisionModal({
  isOpen,
  onClose,
  review,
  currentDecisionAction,
  currentTargetConceptIds,
  concepts,
  materials,
  onSaveDecision,
  onViewHistory,
}: ReviseDecisionModalProps) {
  if (!isOpen) return null;

  // Determine initial active decision from review or props
  const initialAction: "undecided" | "kept_separate" | "merged" = 
    review?.userDecision?.action === "merged" 
      ? "merged" 
      : review?.userDecision?.action === "kept_separate"
      ? "kept_separate"
      : (currentDecisionAction || "undecided");

  const initialTargetIds: string[] = 
    currentTargetConceptIds !== undefined
      ? currentTargetConceptIds
      : review?.userDecision?.targetConceptIds || 
        (review?.userDecision?.targetConceptId ? [review.userDecision.targetConceptId] : []);

  const [selectedAction, setSelectedAction] = useState<"kept_separate" | "merged">(
    initialAction === "merged" ? "merged" : "kept_separate"
  );
  const [selectedTargetConceptIds, setSelectedTargetConceptIds] = useState<string[]>(initialTargetIds);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available concepts list
  const candidateIds = new Set(review?.candidateConcepts?.map((c) => c.conceptId) || []);
  const candidateConceptsList = concepts.filter((c) => candidateIds.has(c.id));
  const otherConceptsList = concepts.filter((c) => !candidateIds.has(c.id));
  const allAvailable = [...candidateConceptsList, ...otherConceptsList];

  const titleCounts = allAvailable.reduce((acc, c) => {
    acc[c.title] = (acc[c.title] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Multi-target toggle: each concept has independent selection state
  const toggleTargetConcept = (id: string) => {
    setSelectedTargetConceptIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Dirty state calculation
  const isActionChanged = selectedAction !== initialAction;

  const sortedInitial = [...initialTargetIds].sort();
  const sortedSelected = [...selectedTargetConceptIds].sort();
  const areTargetsChanged = selectedAction === "merged" && (
    sortedInitial.length !== sortedSelected.length ||
    sortedInitial.some((id, index) => id !== sortedSelected[index])
  );

  const isDirty = initialAction === "undecided" || isActionChanged || areTargetsChanged;

  // Merge validation: require at least one target concept before saving
  const isValid = selectedAction === "kept_separate" || (selectedAction === "merged" && selectedTargetConceptIds.length > 0);

  const canSave = isDirty && isValid && !isSubmitting;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSubmitting(true);
    try {
      await onSaveDecision(selectedAction, selectedAction === "merged" ? selectedTargetConceptIds : []);
      onClose();
    } catch (err) {
      console.error("Save decision error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format display of current decision in database
  const currentDecisionDisplay =
    initialAction === "merged"
      ? `Merged (${initialTargetIds.length} concept${initialTargetIds.length === 1 ? "" : "s"})`
      : initialAction === "kept_separate"
      ? "Kept Separate"
      : "Pending decision (Undecided)";

  return (
    <div 
      id="revise-decision-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div 
        id="revise-decision-modal-container"
        className="bg-bg-surface border border-border-color rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border-color flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Revise Decision</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Change the integration decision for this material
            </p>
          </div>
          <button
            id="revise-decision-close-btn"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Current Decision Box */}
          <div className="p-3.5 rounded-lg bg-bg-subtle border border-border-color flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">Current decision</span>
              <span className="text-xs font-bold text-text-primary block">
                {currentDecisionDisplay}
              </span>
            </div>
            {onViewHistory && review?.decisionHistory && review.decisionHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewHistory();
                }}
                className="text-[11px] text-accent-highlight hover:underline flex items-center gap-1 shrink-0 cursor-pointer font-medium"
              >
                <History size={12} />
                Prior history ({review.decisionHistory.length})
              </button>
            )}
          </div>

          {/* Decision Chooser */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-text-primary block">
              Choose integration decision:
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Option 1: Keep Separate */}
              {(() => {
                const isCurrent = initialAction === "kept_separate";
                const isSelected = selectedAction === "kept_separate";
                const isInactiveCurrent = isCurrent && isSelected;

                return (
                  <button
                    id="revise-decision-option-keep-separate"
                    type="button"
                    disabled={isInactiveCurrent}
                    onClick={() => setSelectedAction("kept_separate")}
                    className={`p-3 rounded-lg border text-left transition-colors relative ${
                      isInactiveCurrent
                        ? "opacity-60 bg-bg-subtle border-border-color cursor-default"
                        : isSelected
                        ? "border-slate-900 dark:border-slate-100 bg-slate-900/5 dark:bg-slate-100/10 ring-1 ring-slate-900/20 dark:ring-slate-100/20 cursor-pointer"
                        : "border-border-color bg-bg-subtle/50 hover:bg-bg-subtle text-text-secondary cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-text-primary">Keep Separate</span>
                      {isCurrent ? (
                        <span className="text-[10px] text-text-muted px-1.5 py-0.2 rounded bg-bg-surface border border-border-color font-semibold">
                          Current
                        </span>
                      ) : isSelected ? (
                        <CheckCircle2 size={14} className="text-slate-900 dark:text-slate-100" />
                      ) : null}
                    </div>
                    <p className="text-[11px] text-text-muted">
                      Preserve as independent knowledge
                    </p>
                  </button>
                );
              })()}

              {/* Option 2: Merge */}
              {(() => {
                const isCurrent = initialAction === "merged";
                const isSelected = selectedAction === "merged";
                const isInactiveCurrent = isCurrent && isSelected;

                return (
                  <button
                    id="revise-decision-option-merge"
                    type="button"
                    disabled={allAvailable.length === 0 || isInactiveCurrent}
                    onClick={() => setSelectedAction("merged")}
                    className={`p-3 rounded-lg border text-left transition-colors relative ${
                      allAvailable.length === 0
                        ? "opacity-40 cursor-not-allowed border-border-color bg-bg-subtle"
                        : isInactiveCurrent
                        ? "opacity-80 bg-bg-subtle border-border-color cursor-default"
                        : isSelected
                        ? "border-slate-900 dark:border-slate-100 bg-slate-900/5 dark:bg-slate-100/10 ring-1 ring-slate-900/20 dark:ring-slate-100/20 cursor-pointer"
                        : "border-border-color bg-bg-subtle/50 hover:bg-bg-subtle text-text-secondary cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-text-primary">Merge</span>
                      {isCurrent ? (
                        <span className="text-[10px] text-text-muted px-1.5 py-0.2 rounded bg-bg-surface border border-border-color font-semibold">
                          Current
                        </span>
                      ) : isSelected ? (
                        <CheckCircle2 size={14} className="text-slate-900 dark:text-slate-100" />
                      ) : null}
                    </div>
                    <p className="text-[11px] text-text-muted">
                      Combine into existing knowledge
                    </p>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Merge Target Selection (Multi-select) */}
          {selectedAction === "merged" && (
            <div className="space-y-2 pt-1 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-primary block">
                  Select concepts to merge with:
                </label>
                <span className="text-[11px] text-text-muted">
                  {selectedTargetConceptIds.length} selected {selectedTargetConceptIds.length === 0 && "(at least 1 required)"}
                </span>
              </div>

              {allAvailable.length === 0 ? (
                <p className="text-xs text-text-muted p-4 rounded-lg bg-bg-subtle border border-border-color text-center">
                  No existing concepts available to merge with.
                </p>
              ) : (
                <div 
                  id="merge-target-concepts-list"
                  className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1"
                >
                  {allAvailable.map((concept) => {
                    const isChecked = selectedTargetConceptIds.includes(concept.id);
                    const isDuplicateTitle = (titleCounts[concept.title] || 0) > 1;
                    const conceptSources = materials?.filter((m) =>
                      concept.sourceMaterialIds?.includes(m.id)
                    ) || [];
                    const isCandidate = candidateIds.has(concept.id);
                    const formattedDate = formatConceptDate(concept.createdAt);

                    return (
                      <button
                        key={concept.id}
                        id={`merge-target-concept-${concept.id}`}
                        type="button"
                        onClick={() => toggleTargetConcept(concept.id)}
                        className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                          isChecked
                            ? "bg-slate-900/5 dark:bg-slate-100/10 border-slate-900/30 dark:border-slate-100/30 text-text-primary"
                            : "bg-bg-surface border-border-color hover:bg-bg-subtle text-text-primary"
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {/* Checkbox */}
                          <div
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked
                                ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900"
                                : "border-border-color bg-bg-surface"
                            }`}
                          >
                            {isChecked && <Check size={11} strokeWidth={2.5} />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-text-primary truncate text-xs">
                                {concept.title}
                              </span>
                              {isDuplicateTitle && (
                                <span
                                  className="text-[10px] font-mono text-text-muted px-1.5 py-0.2 rounded bg-bg-subtle border border-border-color shrink-0"
                                  title={`Concept ID: ${concept.id}`}
                                >
                                  #{concept.id.replace(/^cpt_/, "").slice(-6)}
                                </span>
                              )}
                            </div>

                            {/* Metadata */}
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-text-muted flex-wrap">
                              <span className="font-semibold text-text-secondary">Concept</span>
                              <span>·</span>
                              {formattedDate && (
                                <>
                                  <span>{formattedDate}</span>
                                  <span>·</span>
                                </>
                              )}
                              <span>v{concept.currentVersion}</span>
                              {isCandidate && (
                                <>
                                  <span>·</span>
                                  <span className="text-[10px] text-accent-highlight font-semibold">
                                    Overlap Candidate
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Source Materials (Multiple sources supported) */}
                            {conceptSources.length > 0 && (
                              <div className="text-[10px] text-text-muted mt-1 flex items-center gap-1 flex-wrap">
                                <span className="font-semibold text-text-secondary">Sources:</span>
                                {conceptSources.map((s, idx) => (
                                  <span key={s.id} className="inline-flex items-center gap-0.5">
                                    {s.title} ({s.type})
                                    {idx < conceptSources.length - 1 ? "," : ""}
                                  </span>
                                ))}
                              </div>
                            )}

                            {concept.summary && (
                              <p className="text-[11px] text-text-muted line-clamp-1 mt-0.5">
                                {concept.summary}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions with dirty-state enforcement */}
        <div className="p-3.5 sm:p-4 border-t border-border-color bg-bg-subtle/40 flex items-center justify-end gap-2">
          <button
            id="revise-decision-cancel-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 px-3 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            id="revise-decision-save-btn"
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`h-8 px-4 rounded-lg text-xs font-semibold transition-colors ${
              canSave
                ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 cursor-pointer shadow-xs"
                : "opacity-40 bg-bg-subtle border border-border-color text-text-muted cursor-not-allowed"
            }`}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
