import React from "react";
import { 
  X, 
  History, 
  CheckCircle2, 
  Calendar, 
  GitCommit, 
  FileText, 
  Layers,
  ArrowRight
} from "lucide-react";
import { WorkspaceReview, UserDecisionRecord } from "../../../types";

interface DecisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: WorkspaceReview;
}

export function DecisionHistoryModal({
  isOpen,
  onClose,
  review,
}: DecisionHistoryModalProps) {
  if (!isOpen || !review.userDecision) return null;

  const decision: UserDecisionRecord = review.userDecision;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-bg-surface border border-border-color rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border-color flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} strokeWidth={1.75} className="text-text-muted" />
            <h2 className="text-sm font-bold text-text-primary">Decision History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Current Decision Card */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
              Current Decision
            </span>
            <div className="p-3.5 rounded-lg bg-bg-subtle border border-border-color space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-primary capitalize flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  {decision.action.replace("_", " ")}
                </span>
                <span className="text-[11px] text-text-muted flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(decision.decidedAt).toLocaleString()}
                </span>
              </div>

              <div className="pt-0.5">
                <span className="font-semibold text-text-primary block text-xs">
                  {decision.finalTitle}
                </span>
                {decision.finalSummary && (
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {decision.finalSummary}
                  </p>
                )}
              </div>

              {decision.notes && (
                <p className="text-text-secondary text-[11px] italic bg-bg-surface p-2 rounded-md border border-border-color">
                  "{decision.notes}"
                </p>
              )}
            </div>
          </div>

          {/* Previous Decisions in History */}
          {review.decisionHistory && review.decisionHistory.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                Previous Decisions ({review.decisionHistory.length})
              </span>
              <div className="space-y-2">
                {review.decisionHistory.slice().reverse().map((prev, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-bg-subtle/70 border border-border-color space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text-primary capitalize">
                        {prev.action.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(prev.decidedAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted block font-medium">
                      {prev.finalTitle}
                    </span>
                    {prev.notes && (
                      <p className="text-[11px] text-text-muted italic">
                        "{prev.notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmed Relationships Chain */}
          {decision.finalRelationships.length > 0 && (
            <div className="p-3.5 rounded-lg bg-bg-subtle border border-border-color space-y-2">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                Confirmed Relationships ({decision.finalRelationships.length})
              </span>
              <div className="space-y-1.5">
                {decision.finalRelationships.map((r, i) => (
                  <div key={i} className="p-2 rounded-md bg-bg-surface border border-border-color flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-text-primary">{decision.finalTitle}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-bg-subtle border border-border-color font-mono text-text-muted font-medium">
                      {r.relationType}
                    </span>
                    <span className="font-semibold text-text-primary">{r.targetTitle}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-border-color bg-bg-subtle/50 flex justify-end">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
