import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  GitFork, 
  Plus, 
  Trash2, 
  ArrowRight, 
  X, 
  Check, 
  Link as LinkIcon 
} from "lucide-react";
import { Concept, KnowledgeRelationship, KnowledgeRelationType } from "../../../types";
import { Select } from "../../../shared/components/Select";

interface ConceptRelationshipsListProps {
  currentConcept: Concept;
  relationships: KnowledgeRelationship[];
  availableConcepts: Concept[];
  onAddRelationship: (rel: {
    targetConceptId: string;
    targetTitle: string;
    relationType: KnowledgeRelationType;
    description?: string;
  }) => Promise<void>;
  onDeleteRelationship: (relationshipId: string) => Promise<void>;
  isEditable?: boolean;
}

export function ConceptRelationshipsList({
  currentConcept,
  relationships,
  availableConcepts,
  onAddRelationship,
  onDeleteRelationship,
  isEditable = true,
}: ConceptRelationshipsListProps) {
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedRelationType, setSelectedRelationType] = useState<KnowledgeRelationType>("relates_to");
  const [relationDescription, setRelationDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out the current concept from targets
  const candidateTargets = availableConcepts.filter((c) => c.id !== currentConcept.id);

  const formatRelationLabel = (type: KnowledgeRelationType) => {
    switch (type) {
      case "relates_to":
        return "Relates to";
      case "part_of":
        return "Part of";
      case "prerequisite_for":
        return "Prerequisite for";
      case "extends":
        return "Extends";
      case "contradicts":
        return "Contradicts";
      default:
        return type;
    }
  };

  const getRelationBadgeStyle = (type: KnowledgeRelationType) => {
    switch (type) {
      case "part_of":
        return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
      case "prerequisite_for":
        return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      case "extends":
        return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
      case "contradicts":
        return "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800";
      default:
        return "bg-bg-subtle text-text-secondary border-border-color";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) return;

    const targetConcept = candidateTargets.find((c) => c.id === selectedTargetId);
    if (!targetConcept) return;

    setIsSubmitting(true);
    try {
      await onAddRelationship({
        targetConceptId: targetConcept.id,
        targetTitle: targetConcept.title,
        relationType: selectedRelationType,
        description: relationDescription.trim() || undefined,
      });
      setSelectedTargetId("");
      setSelectedRelationType("relates_to");
      setRelationDescription("");
      setIsAdding(false);
    } catch (err) {
      console.error("Failed to add relationship:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="concept-relationships-card" className="p-4 sm:p-5 rounded-xl bg-bg-surface border border-border-color shadow-2xs space-y-3.5">
      <div className="flex items-center justify-between border-b border-border-color pb-2.5">
        <div className="flex items-center gap-2">
          <GitFork size={15} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Knowledge Relationships
          </h2>
        </div>
        {isEditable && !isAdding && candidateTargets.length > 0 && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-primary hover:text-accent-highlight transition-colors cursor-pointer"
          >
            <Plus size={13} strokeWidth={2} />
            <span>Connect</span>
          </button>
        )}
      </div>

      {/* Add Relationship Inline Form */}
      {isAdding && (
        <form onSubmit={handleSave} className="p-3.5 rounded-lg bg-bg-subtle border border-border-color space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text-primary">Establish Knowledge Relation</span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1">
            <Select
              label="Target Concept"
              value={selectedTargetId}
              onChange={setSelectedTargetId}
              required
              options={[
                { value: "", label: "Select an existing concept..." },
                ...candidateTargets.map((c) => ({
                  value: c.id,
                  label: `${c.title} (v${c.currentVersion})`,
                })),
              ]}
            />
          </div>

          <div className="space-y-1">
            <Select
              label="Relationship Type"
              value={selectedRelationType}
              onChange={(val) => setSelectedRelationType(val as KnowledgeRelationType)}
              options={[
                { value: "relates_to", label: "Relates to" },
                { value: "part_of", label: "Part of" },
                { value: "prerequisite_for", label: "Prerequisite for" },
                { value: "extends", label: "Extends" },
                { value: "contradicts", label: "Contradicts" },
              ]}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-text-muted">Notes / Grounding (Optional)</label>
            <input
              type="text"
              value={relationDescription}
              onChange={(e) => setRelationDescription(e.target.value)}
              placeholder="e.g. Fundamental prerequisite explained in optical principles"
              className="w-full px-2.5 py-1.5 rounded-md bg-bg-surface border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-highlight"
            >
            </input>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedTargetId || isSubmitting}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-accent-highlight text-white hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              <Check size={12} strokeWidth={2} />
              <span>{isSubmitting ? "Connecting..." : "Confirm"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Relationships List */}
      {relationships.length === 0 ? (
        <div className="p-4 rounded-lg bg-bg-subtle/40 border border-border-color/60 text-center">
          <p className="text-xs text-text-muted">
            No knowledge relationships connected to this concept.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const isSource = rel.sourceConceptId === currentConcept.id;
            const otherConceptId = isSource ? rel.targetConceptId : rel.sourceConceptId;
            const otherTitle = isSource 
              ? (rel.targetTitle || "Connected Concept") 
              : (rel.sourceTitle || "Connected Concept");

            return (
              <div
                key={rel.id}
                className="p-3 rounded-lg bg-bg-subtle/50 border border-border-color/70 flex items-start justify-between gap-3 group hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getRelationBadgeStyle(rel.relationType)}`}>
                      {formatRelationLabel(rel.relationType)}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/concept/${otherConceptId}`)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-text-primary hover:text-accent-highlight transition-colors cursor-pointer group/title"
                      title={`Open Concept "${otherTitle}"`}
                    >
                      <span className="truncate max-w-[180px]">{otherTitle}</span>
                      <ArrowRight size={11} className="text-text-muted group-hover/title:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  {rel.description && (
                    <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                      {rel.description}
                    </p>
                  )}
                </div>

                {isEditable && (
                  <button
                    type="button"
                    onClick={() => onDeleteRelationship(rel.id)}
                    className="p-1 rounded text-text-muted hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
                    title="Remove relationship"
                    aria-label="Remove relationship"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
