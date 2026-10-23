import React, { useState } from "react";
import { 
  BookOpen, 
  AlertTriangle, 
  FileText,
  Layers,
  ArrowUpDown,
  Tag
} from "lucide-react";
import { CandidateConcept } from "../../../types";

interface ExistingKnowledgePaneProps {
  candidates: CandidateConcept[];
  selectedConceptId?: string;
  onSelectConcept: (conceptId: string) => void;
  extractedTextPreview: string;
}

export function ExistingKnowledgePane({
  candidates,
  selectedConceptId,
  onSelectConcept,
  extractedTextPreview,
}: ExistingKnowledgePaneProps) {
  const [activeTab, setActiveTab] = useState<"flow" | "details">("flow");

  // If no candidates exist in the workspace, strictly render "No related knowledge found."
  if (candidates.length === 0) {
    return (
      <div 
        id="existing-knowledge-pane-empty"
        className="bg-bg-surface border border-border-color rounded-xl p-4 sm:p-5 space-y-2 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={16} strokeWidth={1.75} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">Existing Knowledge</h3>
        </div>
        <p className="text-xs text-text-muted">No related knowledge found.</p>
      </div>
    );
  }

  const activeCandidate = candidates.find((c) => c.conceptId === selectedConceptId) || candidates[0];

  const titleCounts = candidates.reduce((acc, c) => {
    acc[c.conceptTitle] = (acc[c.conceptTitle] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div 
      id="existing-knowledge-pane"
      className="bg-bg-surface border border-border-color rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs"
    >
      {/* Pane Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-bg-subtle border border-border-color text-text-muted">
            <BookOpen size={16} strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary">Existing Knowledge</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900/5 dark:bg-slate-100/10 text-text-primary border border-border-color">
                {candidates.length} candidate{candidates.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              This material appears to overlap with existing knowledge.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex items-center p-0.5 bg-bg-subtle rounded-lg border border-border-color text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("flow")}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "flow"
                ? "bg-bg-surface text-text-primary shadow-2xs"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Source Comparison
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "details"
                ? "bg-bg-surface text-text-primary shadow-2xs"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Overlap Details
          </button>
        </div>
      </div>

      {/* Candidate Concepts Selector */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
          Candidate Concepts in Workspace
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {candidates.map((candidate) => {
            const isSelected = candidate.conceptId === activeCandidate.conceptId;
            const isDuplicateTitle = (titleCounts[candidate.conceptTitle] || 0) > 1;

            return (
              <button
                key={candidate.conceptId}
                id={`candidate-concept-btn-${candidate.conceptId}`}
                type="button"
                onClick={() => onSelectConcept(candidate.conceptId)}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer relative ${
                  isSelected
                    ? "bg-slate-900/5 dark:bg-slate-100/10 border-slate-900/30 dark:border-slate-100/30 ring-1 ring-slate-900/15 dark:ring-slate-100/15"
                    : "bg-bg-subtle/50 border-border-color hover:bg-bg-subtle"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold text-text-primary truncate block">
                      {candidate.conceptTitle}
                    </span>
                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                      v{candidate.version}
                    </span>
                  </div>
                  {isDuplicateTitle && (
                    <span
                      className="text-[10px] font-mono text-text-muted px-1.5 py-0.2 rounded bg-bg-surface border border-border-color shrink-0"
                    >
                      #{candidate.conceptId.replace(/^cpt_/, "").slice(-6)}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-text-muted line-clamp-1 mt-1">
                  {candidate.conceptSummary || "No summary available."}
                </p>

                {candidate.hasConflict && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    <AlertTriangle size={11} />
                    Potential difference
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Potential Divergence Notice */}
      {activeCandidate.hasConflict && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block text-xs">Potential difference noted</span>
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              {activeCandidate.conflictDescription || 
                "The new material introduces information that differs from this concept."}
            </p>
          </div>
        </div>
      )}

      {/* Active Tab View: 3-Tier Comparison Flow */}
      {activeTab === "flow" ? (
        <div className="space-y-3 pt-1">
          {/* Factual Rationale Header */}
          <div className="p-3 rounded-lg bg-bg-subtle border border-border-color space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <span className="uppercase text-[10px] tracking-wider text-text-muted font-bold">Factual Rationale</span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {activeCandidate.similarityRationale}
            </p>
            {activeCandidate.overlappingTerms && activeCandidate.overlappingTerms.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border-color/60">
                <span className="text-[10px] text-text-muted font-medium flex items-center gap-1">
                  <Tag size={10} /> Shared topics:
                </span>
                {activeCandidate.overlappingTerms.map((term) => (
                  <span
                    key={term}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-surface border border-border-color text-text-primary font-medium"
                  >
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 3-Tier Source-Level Comparison: NEW MATERIAL ↕ EXISTING KNOWLEDGE ↕ SOURCE MATERIALS */}
          <div className="space-y-2.5">
            {/* 1. NEW MATERIAL */}
            <div className="p-3 rounded-lg bg-bg-subtle/70 border border-border-color space-y-1.5">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-border-color">
                <span className="font-bold text-text-primary flex items-center gap-1.5">
                  <FileText size={13} className="text-text-muted" />
                  New Material (Related Excerpt)
                </span>
                <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider">
                  Newly imported
                </span>
              </div>
              <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono max-h-[120px] overflow-y-auto">
                {activeCandidate.relatedNewContentSnippet || extractedTextPreview || "*No text extracted.*"}
              </div>
            </div>

            {/* Vertical Flow Divider */}
            <div className="flex items-center justify-center -my-1 text-text-muted">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-surface border border-border-color text-[10px] font-semibold text-text-muted">
                <ArrowUpDown size={11} />
                <span>Overlaps with</span>
              </div>
            </div>

            {/* 2. EXISTING KNOWLEDGE */}
            <div className="p-3 rounded-lg bg-bg-subtle/70 border border-border-color space-y-1.5">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-border-color">
                <span className="font-bold text-text-primary flex items-center gap-1.5">
                  <BookOpen size={13} className="text-text-muted" />
                  Existing Concept: {activeCandidate.conceptTitle}
                </span>
                <span className="text-[10px] font-mono text-text-muted font-semibold">
                  v{activeCandidate.version}
                </span>
              </div>
              <p className="text-[11px] text-text-muted italic">
                {activeCandidate.conceptSummary}
              </p>
              <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono max-h-[120px] overflow-y-auto">
                {activeCandidate.relatedExistingContentSnippet || activeCandidate.existingContent}
              </div>
            </div>

            {/* Vertical Flow Divider */}
            <div className="flex items-center justify-center -my-1 text-text-muted">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-surface border border-border-color text-[10px] font-semibold text-text-muted">
                <ArrowUpDown size={11} />
                <span>Associated with</span>
              </div>
            </div>

            {/* 3. SOURCE MATERIALS */}
            <div className="p-3 rounded-lg bg-bg-subtle/70 border border-border-color space-y-2">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-border-color">
                <span className="font-bold text-text-primary flex items-center gap-1.5">
                  <Layers size={13} className="text-text-muted" />
                  Existing Source Materials ({activeCandidate.sourceMaterials?.length || 0})
                </span>
                <span className="text-[10px] text-text-muted">
                  Grounding sources
                </span>
              </div>

              {activeCandidate.sourceMaterials && activeCandidate.sourceMaterials.length > 0 ? (
                <div className="space-y-1.5">
                  {activeCandidate.sourceMaterials.map((source, index) => (
                    <div
                      key={source.id || index}
                      className="p-2 rounded-md bg-bg-surface border border-border-color text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text-primary truncate">
                          {source.title}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-bg-subtle text-text-muted">
                          {source.type}
                        </span>
                      </div>
                      {source.snippet && (
                        <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
                          {source.snippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-text-muted py-1">
                  Direct workspace concept (no external source materials linked yet).
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Overlap Details Tab */
        <div className="space-y-2 pt-1 text-xs">
          <div className="p-3.5 rounded-lg bg-bg-subtle border border-border-color space-y-2">
            <span className="font-semibold text-text-primary block">
              Full Existing Concept Content
            </span>
            <div className="text-xs text-text-secondary max-h-[220px] overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed p-2 rounded bg-bg-surface border border-border-color">
              {activeCandidate.existingContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
