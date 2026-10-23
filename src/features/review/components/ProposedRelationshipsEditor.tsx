import React, { useState } from "react";
import { 
  Network, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  ArrowRight
} from "lucide-react";
import { ProposedRelationship, KnowledgeRelationType, Concept } from "../../../types";
import { Select } from "../../../shared/components/Select";

interface ProposedRelationshipsEditorProps {
  relationships: ProposedRelationship[];
  onChangeRelationships: (relationships: ProposedRelationship[]) => void;
  availableConcepts: Concept[];
  materialTitle: string;
}

const RELATION_TYPE_LABELS: Record<KnowledgeRelationType, { label: string; badgeClass: string }> = {
  relates_to: { label: "Relates to", badgeClass: "bg-bg-surface text-text-secondary border-border-color" },
  part_of: { label: "Part of", badgeClass: "bg-bg-surface text-text-secondary border-border-color" },
  prerequisite_for: { label: "Prerequisite for", badgeClass: "bg-bg-surface text-text-secondary border-border-color" },
  extends: { label: "Extends", badgeClass: "bg-bg-surface text-text-secondary border-border-color" },
  contradicts: { label: "Contradicts", badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
};

export function ProposedRelationshipsEditor({
  relationships,
  onChangeRelationships,
  availableConcepts,
  materialTitle,
}: ProposedRelationshipsEditorProps) {
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Sprint 6 (Requirement 3): Filter displayed relationships:
  // - Only show relationships genuinely connected to a valid target concept in the workspace
  // - Remove duplicate relationship cards and invalid/self-referential relationships
  const availableConceptMap = new Map(availableConcepts.map((c) => [c.id, c]));
  
  const displayedRelationships = React.useMemo(() => {
    const seen = new Set<string>();
    const valid: ProposedRelationship[] = [];

    for (const rel of relationships) {
      // Must have valid target concept
      if (!rel.targetConceptId || !availableConceptMap.has(rel.targetConceptId)) {
        continue;
      }
      // Must not be legacy automatically generated weak relationship
      if (rel.id && rel.id.startsWith("prop_rel_") && !rel.id.startsWith("prop_rel_custom_")) {
        continue;
      }
      // Must not be self-referential
      if (
        rel.sourceTitle &&
        rel.targetTitle &&
        rel.sourceTitle.trim().toLowerCase() === rel.targetTitle.trim().toLowerCase()
      ) {
        continue;
      }
      // Deduplicate by target concept ID and relation type
      const key = `${rel.targetConceptId}::${rel.relationType}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      valid.push(rel);
    }

    return valid;
  }, [relationships, availableConceptMap]);

  // New relationship draft state
  const [newTargetConceptId, setNewTargetConceptId] = useState<string>(
    availableConcepts[0]?.id || ""
  );
  const [newRelationType, setNewRelationType] = useState<KnowledgeRelationType>("relates_to");
  const [newGrounding, setNewGrounding] = useState<string>("User specified");

  const handleUpdateRelationType = (id: string, newType: KnowledgeRelationType) => {
    const updated = relationships.map((r) => (r.id === id ? { ...r, relationType: newType } : r));
    onChangeRelationships(updated);
  };

  const handleRemoveRelationship = (id: string) => {
    const updated = relationships.filter((r) => r.id !== id);
    onChangeRelationships(updated);
  };

  const handleAddRelationship = () => {
    const targetConcept = availableConcepts.find((c) => c.id === newTargetConceptId);
    if (!targetConcept) return;

    const newRel: ProposedRelationship = {
      id: `prop_rel_custom_${Date.now()}`,
      sourceTitle: materialTitle,
      targetConceptId: targetConcept.id,
      targetTitle: targetConcept.title,
      relationType: newRelationType,
      groundingSource: newGrounding || "User specified",
      isEditable: true,
    };

    onChangeRelationships([...relationships, newRel]);
    setShowAddForm(false);
    setNewGrounding("User specified");
  };

  return (
    <div className="bg-bg-surface border border-border-color rounded-xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
      {/* Pane Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={16} strokeWidth={1.75} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">Relationships</h3>
        </div>

        {availableConcepts.length > 0 && displayedRelationships.length > 0 && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            <Plus size={13} />
            Add relationship
          </button>
        )}
      </div>

      {/* Add New Relationship Inline Form */}
      {showAddForm && (
        <div className="p-3.5 rounded-lg bg-bg-subtle border border-border-color space-y-3">
          <span className="text-xs font-bold text-text-primary block">
            Add Relationship
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <Select
                label="Target Concept"
                value={newTargetConceptId}
                onChange={setNewTargetConceptId}
                options={availableConcepts.map((c) => ({
                  value: c.id,
                  label: `${c.title} (v{c.currentVersion})`,
                }))}
              />
            </div>

            <div>
              <Select
                label="Relationship Type"
                value={newRelationType}
                onChange={(val) => setNewRelationType(val as KnowledgeRelationType)}
                options={[
                  { value: "relates_to", label: "Relates to" },
                  { value: "extends", label: "Extends" },
                  { value: "part_of", label: "Part of" },
                  { value: "prerequisite_for", label: "Prerequisite for" },
                  { value: "contradicts", label: "Contradicts" },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-text-primary block mb-1">Source / Note</label>
            <input
              type="text"
              value={newGrounding}
              onChange={(e) => setNewGrounding(e.target.value)}
              placeholder="Source or rationale..."
              className="w-full p-2 rounded-lg bg-bg-surface border border-border-color text-text-primary text-xs focus:outline-none focus:border-accent-highlight"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowAddForm(false)}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleAddRelationship}
              className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors shadow-xs cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Relationships List */}
      {displayedRelationships.length === 0 ? (
        <div className="space-y-2 py-1">
          <p className="text-xs text-text-muted">No relationships yet.</p>
          {availableConcepts.length > 0 && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-highlight hover:underline cursor-pointer"
            >
              <Plus size={13} />
              Add relationship
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayedRelationships.map((rel) => {
            const typeConfig = RELATION_TYPE_LABELS[rel.relationType] || RELATION_TYPE_LABELS.relates_to;
            const isEditing = editingRelId === rel.id;

            return (
              <div
                key={rel.id}
                className="p-3 rounded-lg bg-bg-subtle border border-border-color space-y-1.5 transition-all"
              >
                {/* Chain Visualization Row */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5 font-medium flex-wrap">
                    <span className="text-text-primary px-2 py-0.5 rounded-md bg-bg-surface border border-border-color font-mono text-[11px] truncate max-w-[160px]">
                      {rel.sourceTitle}
                    </span>

                    <ArrowRight size={12} className="text-text-muted shrink-0" />

                    {isEditing ? (
                      <div className="w-36">
                        <Select
                          value={rel.relationType}
                          onChange={(val) => handleUpdateRelationType(rel.id, val as KnowledgeRelationType)}
                          options={[
                            { value: "relates_to", label: "Relates to" },
                            { value: "extends", label: "Extends" },
                            { value: "part_of", label: "Part of" },
                            { value: "prerequisite_for", label: "Prerequisite for" },
                            { value: "contradicts", label: "Contradicts" },
                          ]}
                        />
                      </div>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${typeConfig.badgeClass}`}>
                        {typeConfig.label}
                      </span>
                    )}

                    <ArrowRight size={12} className="text-text-muted shrink-0" />

                    <span className="text-text-primary font-semibold text-xs truncate max-w-[160px]">
                      {rel.targetTitle}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingRelId(isEditing ? null : rel.id)}
                      className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-surface cursor-pointer"
                      title={isEditing ? "Done editing" : "Edit relationship"}
                    >
                      {isEditing ? <Check size={13} className="text-emerald-500" /> : <Edit2 size={13} />}
                    </button>
                    <button
                      onClick={() => handleRemoveRelationship(rel.id)}
                      className="p-1 rounded text-text-muted hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                      title="Remove relationship"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Grounding Source Attribution */}
                {rel.groundingSource && (
                  <div className="text-[11px] text-text-muted flex items-start gap-1.5 pt-0.5">
                    <span className="font-medium text-text-muted">Source:</span>
                    <span className="text-text-secondary leading-relaxed">
                      {rel.groundingSource}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
