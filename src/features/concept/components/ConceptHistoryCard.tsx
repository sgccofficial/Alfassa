import React from "react";
import { Timer } from "iconoir-react";

interface ConceptHistoryCardProps {
  onOpenHistory: () => void;
  versionCount: number;
}

export function ConceptHistoryCard({ onOpenHistory, versionCount }: ConceptHistoryCardProps) {
  return (
    <div className="p-4 rounded-xl bg-bg-surface border border-border-color shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-text-primary text-xs">
          Concept History
        </span>
        <button
          type="button"
          onClick={onOpenHistory}
          className="text-xs font-medium text-accent-highlight hover:text-accent-highlight/80 flex items-center gap-1 cursor-pointer"
        >
          <Timer size={12} />
          <span>View All ({versionCount})</span>
        </button>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">
        Audit trail of all revisions and changes made to this knowledge entity.
      </p>
    </div>
  );
}
