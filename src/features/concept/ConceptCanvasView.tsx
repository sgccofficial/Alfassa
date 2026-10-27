import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Timer, Edit, FloppyDisk, Xmark, Clock, BookStack, Check, Calendar, WarningCircle } from "iconoir-react";
import { Loading } from "loading-dev";
import { useAuth } from "../../shared/providers/AuthProvider";
import { 
  Concept, 
  ConceptVersion, 
  Material, 
  KnowledgeRelationship, 
  KnowledgeRelationType,
  MaterialExtraction
} from "../../types";
import { 
  subscribeToUserConcepts, 
  subscribeToConceptVersions, 
  subscribeToKnowledgeRelationships,
  saveConceptWithVersion,
  addKnowledgeRelationship,
  deleteKnowledgeRelationship,
  deleteConcept
} from "../../services/concept-db";
import { subscribeToUserMaterials } from "../../services/material-db";
import { getExtractionsForUser } from "../../services/extraction-db";
import { ConceptSourcesList } from "./components/ConceptSourcesList";
import { ConceptConnectionsList } from "./components/ConceptConnectionsList";
import { ConceptRelationshipsList } from "./components/ConceptRelationshipsList";
import { ConceptVersionHistoryModal } from "./components/ConceptVersionHistoryModal";
import { ConceptHistoryCard } from "./components/ConceptHistoryCard";

export function ConceptCanvasView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.uid || "guest-user";

  const [concept, setConcept] = useState<Concept | null>(null);
  const [allConcepts, setAllConcepts] = useState<Concept[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [extractionsMap, setExtractionsMap] = useState<Record<string, MaterialExtraction>>({});
  const [versions, setVersions] = useState<ConceptVersion[]>([]);
  const [relationships, setRelationships] = useState<KnowledgeRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editChangeReason, setEditChangeReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotification, setSaveSuccessNotification] = useState(false);

  // Version History Modal
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);

  // 1. Subscribe to user concepts and materials
  useEffect(() => {
    const unsubConcepts = subscribeToUserConcepts(userId, (concepts) => {
      setAllConcepts(concepts);
      const found = concepts.find((c) => c.id === id);
      if (found) {
        setConcept(found);
      }
      setIsLoading(false);
    });

    const unsubMaterials = subscribeToUserMaterials(userId, (mats) => {
      setMaterials(mats);
    });

    const unsubRelationships = subscribeToKnowledgeRelationships(userId, (rels) => {
      setRelationships(rels);
    });

    // Fetch extractions for provenance traceability
    getExtractionsForUser(userId).then((extList) => {
      const map: Record<string, MaterialExtraction> = {};
      for (const ext of extList) {
        map[ext.materialId] = ext;
      }
      setExtractionsMap(map);
    });

    return () => {
      unsubConcepts();
      unsubMaterials();
      unsubRelationships();
    };
  }, [userId, id]);

  // 2. Subscribe to versions when concept is loaded
  useEffect(() => {
    if (!id) return;
    const unsubVersions = subscribeToConceptVersions(id, (vers) => {
      setVersions(vers);
    });
    return () => unsubVersions();
  }, [id]);

  // 3. Initialize edit fields when concept updates or edit mode opens
  useEffect(() => {
    if (concept && !isEditing) {
      setEditTitle(concept.title || "");
      setEditSummary(concept.summary || "");
      setEditContent(concept.content || "");
      setEditChangeReason("");
    }
  }, [concept, isEditing]);

  const isDirty = concept ? (
    editTitle.trim() !== (concept.title || "").trim() ||
    editSummary.trim() !== (concept.summary || "").trim() ||
    editContent.trim() !== (concept.content || "").trim()
  ) : false;

  // Handle Save Concept Changes
  const handleSaveConcept = async () => {
    if (!concept || isSaving || !isDirty) return;
    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const nextVersionNumber = concept.currentVersion + 1;
      const reason = editChangeReason.trim() || `Direct edit in Concept Canvas (updated knowledge representation)`;

      const updatedConcept: Concept = {
        ...concept,
        title: editTitle.trim() || concept.title,
        summary: editSummary.trim(),
        content: editContent.trim(),
        currentVersion: nextVersionNumber,
        updatedAt: now,
      };

      // Save concept and append immutable ConceptVersion
      await saveConceptWithVersion(updatedConcept, reason);
      setConcept(updatedConcept);
      setIsEditing(false);
      setSaveSuccessNotification(true);
      setTimeout(() => setSaveSuccessNotification(false), 3000);
    } catch (err) {
      console.error("Failed to save concept:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Cancel Edit
  const handleCancelEdit = () => {
    if (concept) {
      setEditTitle(concept.title || "");
      setEditSummary(concept.summary || "");
      setEditContent(concept.content || "");
      setEditChangeReason("");
    }
    setIsEditing(false);
  };

  // Add Knowledge Relationship
  const handleAddRelationship = async (relData: {
    targetConceptId: string;
    targetTitle: string;
    relationType: KnowledgeRelationType;
    description?: string;
  }) => {
    if (!concept) return;
    const now = new Date().toISOString();
    const relId = `rel_${concept.id}_${relData.targetConceptId}_${Date.now()}`;

    const newRel: KnowledgeRelationship = {
      id: relId,
      userId,
      workspaceId: concept.workspaceId || "default",
      sourceConceptId: concept.id,
      targetConceptId: relData.targetConceptId,
      sourceTitle: concept.title,
      targetTitle: relData.targetTitle,
      relationType: relData.relationType,
      description: relData.description,
      isUserConfirmed: true,
      createdAt: now,
      updatedAt: now,
    };

    await addKnowledgeRelationship(newRel);
  };

  // Delete Knowledge Relationship
  const handleDeleteRelationship = async (relationshipId: string) => {
    await deleteKnowledgeRelationship(relationshipId, userId);
  };

  // Delete Concept
  const handleDeleteConcept = async () => {
    if (!concept) return;
    await deleteConcept(concept.id, userId);
    navigate("/concepts");
  };

  // Filter sources for this concept
  const sourceMaterials = materials.filter((m) => 
    concept?.sourceMaterialIds?.includes(m.id)
  );

  // Filter relationships connecting this concept
  const conceptRelationships = relationships.filter((r) => 
    r.sourceConceptId === concept?.id || r.targetConceptId === concept?.id
  );

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return "Recently";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Recently";
    }
  };

  if (isLoading) {
    return (
      <div id="concept-canvas-loading" className="min-h-screen bg-bg-main flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-text-secondary">
          <Loading className="text-text-muted" size={24} />
          <p className="text-xs font-medium">Opening Knowledge Concept...</p>
        </div>
      </div>
    );
  }

  if (!concept) {
    return (
      <div id="concept-canvas-not-found" className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-6 text-center">
        <div className="p-3 rounded-full bg-bg-subtle text-text-muted mb-3">
          <WarningCircle size={24} />
        </div>
        <h2 className="text-base font-bold text-text-primary mb-1">Concept not found</h2>
        <p className="text-xs text-text-muted max-w-sm mb-4">
          This knowledge concept does not exist or may have been relocated.
        </p>
        <button
          type="button"
          onClick={() => navigate("/concepts")}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
        >
          Back to Knowledge Base
        </button>
      </div>
    );
  }

  return (
    <div id="concept-canvas-view" className="min-h-screen bg-bg-main flex flex-col pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-bg-surface/95 backdrop-blur-md border-b border-border-color px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate("/concepts")}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors shrink-0 cursor-pointer"
            title="Back to Knowledge Base"
            aria-label="Back to Knowledge Base"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </button>

          <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1.5 rounded-md bg-bg-subtle border border-border-color text-text-secondary shrink-0">
                <BookStack size={14} strokeWidth={1.75} />
              </span>
              <h1 className="text-sm sm:text-base font-bold text-text-primary truncate">
                {isEditing ? editTitle : concept.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted">
              {/* Version Badge */}
              <button
                type="button"
                onClick={() => setIsVersionModalOpen(true)}
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-bg-subtle hover:bg-slate-200 dark:hover:bg-slate-800 text-text-primary border border-border-color transition-colors inline-flex items-center gap-1 cursor-pointer"
                title="View version audit history"
              >
                <span>Version {concept.currentVersion}</span>
                <Timer size={11} className="text-text-muted" />
              </button>

              <span>•</span>
              <span className="text-[11px]">Updated {formatRelativeTime(concept.updatedAt)}</span>

              {saveSuccessNotification && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] inline-flex items-center gap-1 animate-in fade-in duration-200">
                  <Check size={12} />
                  <span>Saved</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsVersionModalOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-subtle border border-border-color transition-colors cursor-pointer"
          >
            <Timer size={14} strokeWidth={1.75} />
            <span>History ({versions.length || 1})</span>
          </button>

          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConcept}
                disabled={isSaving || !isDirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loading size={13}  />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <FloppyDisk size={13} strokeWidth={2} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-surface hover:bg-bg-subtle text-text-primary border border-border-color transition-colors cursor-pointer"
            >
              <Edit size={13} strokeWidth={1.75} />
              <span>Edit Concept</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Knowledge Column (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <section 
              id="concept-knowledge-representation" 
              className="p-6 sm:p-7 rounded-2xl bg-bg-surface border border-border-color shadow-2xs space-y-5"
            >
              {isEditing ? (
                /* Editable Mode */
                <div className="space-y-4">
                  {/* Title Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-concept-title" className="block text-xs font-semibold text-text-primary">
                      Concept Title
                    </label>
                    <input
                      id="edit-concept-title"
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-bg-surface border border-border-color text-sm sm:text-base font-bold text-text-primary focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight transition-colors"
                      placeholder="Title of this knowledge concept"
                    />
                  </div>

                  {/* Summary Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-concept-summary" className="block text-xs font-semibold text-text-primary">
                      Summary
                    </label>
                    <textarea
                      id="edit-concept-summary"
                      rows={3}
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full p-3 rounded-xl bg-bg-surface border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight transition-colors resize-y leading-relaxed placeholder:text-text-muted"
                      placeholder="Concise overview of the accepted knowledge..."
                    />
                  </div>

                  {/* Knowledge Content Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-concept-content" className="block text-xs font-semibold text-text-primary">
                      Concept Content
                    </label>
                    <textarea
                      id="edit-concept-content"
                      rows={14}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-3.5 rounded-xl bg-bg-surface border border-border-color text-xs sm:text-sm font-mono text-text-primary focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight transition-colors resize-y leading-relaxed"
                      placeholder="The complete representation for this concept..."
                    />
                  </div>

                  {/* Change Reason Note */}
                  <div className="space-y-1.5 pt-2 border-t border-border-color">
                    <label htmlFor="edit-concept-reason" className="block text-[11px] font-medium text-text-muted">
                      Reason for revision (recorded in Version History)
                    </label>
                    <input
                      id="edit-concept-reason"
                      type="text"
                      value={editChangeReason}
                      onChange={(e) => setEditChangeReason(e.target.value)}
                      placeholder="e.g. Refined core definition after reviewing optical lab notes"
                      className="w-full px-3 py-1.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-highlight transition-colors placeholder:text-text-muted"
                    />
                  </div>
                </div>
              ) : (
                /* Read / Display Mode */
                <div className="space-y-5">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
                      {concept.title}
                    </h1>
                    {concept.summary && (
                      <p className="mt-2 text-xs sm:text-sm text-text-secondary leading-relaxed border-l-2 border-border-color pl-3 py-0.5">
                        {concept.summary}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-border-color pt-4">
                    <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                      Concept Knowledge
                    </h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed text-text-primary whitespace-pre-wrap font-sans">
                      {concept.content || (
                        <p className="text-text-muted italic">
                          No knowledge content documented for this concept. Click "Edit Concept" to add notes.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Provenance Sources & Relationships (1/3 width) */}
          <div className="space-y-6">
            {/* Contributing Sources List */}
            <ConceptSourcesList 
              sourceMaterials={sourceMaterials} 
              extractions={extractionsMap}
            />

            {/* Connections */}
            <ConceptConnectionsList
              currentConcept={concept}
              allMaterials={materials}
              allConcepts={allConcepts}
              extractionsMap={extractionsMap}
              existingRelationships={conceptRelationships}
              onAddRelationship={handleAddRelationship}
              onSelectMaterial={(matId) => navigate(`/material/${matId}`)}
              onSelectConcept={(conceptId) => navigate(`/concept/${conceptId}`)}
            />

            {/* Knowledge Relationships List */}
            <ConceptRelationshipsList
              currentConcept={concept}
              relationships={conceptRelationships}
              availableConcepts={allConcepts}
              onAddRelationship={handleAddRelationship}
              onDeleteRelationship={handleDeleteRelationship}
              isEditable={true}
            />

            {/* Concept History */}
            <ConceptHistoryCard 
              onOpenHistory={() => setIsVersionModalOpen(true)}
              versionCount={versions.length}
            />

            {/* Delete Concept Placeholder */}
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-xs space-y-2">
              <span className="font-semibold text-red-800 dark:text-red-400 block border-b border-red-200 dark:border-red-900/50 pb-1.5">
                Danger Zone
              </span>
              <button
                type="button"
                className="w-full text-left text-red-700 dark:text-red-400 font-medium hover:text-red-900 dark:hover:text-red-300 cursor-pointer"
                onClick={handleDeleteConcept}
              >
                Delete Concept
              </button>
            </div>

            {/* Knowledge Metadata Card */}
            <div className="p-4 rounded-xl bg-bg-surface border border-border-color text-xs space-y-2 shadow-2xs">

              <span className="font-semibold text-text-primary block border-b border-border-color pb-1.5">
                Entity Status
              </span>
              <div className="flex items-center justify-between text-text-muted">
                <span>Knowledge Entity</span>
                <span className="font-medium text-text-primary">Accepted Concept</span>
              </div>
              <div className="flex items-center justify-between text-text-muted">
                <span>Current Version</span>
                <span className="font-medium text-text-primary">v{concept.currentVersion}</span>
              </div>
              <div className="flex items-center justify-between text-text-muted">
                <span>Contributing Sources</span>
                <span className="font-medium text-text-primary">{sourceMaterials.length}</span>
              </div>
              <div className="flex items-center justify-between text-text-muted">
                <span>Active Connections</span>
                <span className="font-medium text-text-primary">{conceptRelationships.length}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Version History Modal */}
      <ConceptVersionHistoryModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        versions={versions}
        currentVersionNumber={concept.currentVersion}
      />
    </div>
  );
}
