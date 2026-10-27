import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, useLocation, NavLink } from "react-router-dom";
import { ArrowLeft, ArrowRight, FloppyDisk, Page, Check, ViewColumns2, LayoutLeft, BookStack, EditPencil } from "iconoir-react";
import { Loading } from "loading-dev";
import { 
  Material, 
  MaterialExtraction, 
  WorkspaceReview, 
  Concept, 
  ProposedRelationship, 
} from "../../types";
import { useAuth } from "../../shared/providers/AuthProvider";
import { getMaterialFromDb, subscribeToUserMaterials, saveMaterialToDb } from "../../services/material-db";
import { subscribeToExtraction, saveExtractionToDb } from "../../services/extraction-db";
import { 
  subscribeToUserWorkspaceReviews, 
  saveWorkspaceReview, 
  updateReviewStatus 
} from "../../services/review-db";
import { subscribeToUserConcepts } from "../../services/concept-db";
import { generateWorkspaceReview } from "../../engines/review-engine/generator";
import { executeReviewDecision } from "../../engines/review-engine/decision-handler";
import { ProcessingIndicator } from "../../shared/components/ProcessingIndicator";
import { extractExtension, getBaseFileName, enforceImmutableExtension } from "../../shared/utils/filename-helper";

import { SourceMaterialPane } from "../review/components/SourceMaterialPane";
import { ProposedRelationshipsEditor } from "../review/components/ProposedRelationshipsEditor";
import { ReviseDecisionModal } from "../review/components/ReviseDecisionModal";
import { DecisionHistoryModal } from "../review/components/DecisionHistoryModal";
import { useMaterialIntake } from "./useMaterialIntake";
import { FlexcilCanvasBoard } from "./FlexcilCanvasBoard";
import { sanitizeOcrText } from "../../shared/utils/ocr-sanitizer";

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "";
  try {
    const then = new Date(dateString).getTime();
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  } catch {
    return dateString;
  }
}

export function MaterialCanvasView() {
  const { id: routeId, materialId: routeMaterialId } = useParams<{ id?: string; materialId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const materialId = routeId || routeMaterialId || searchParams.get("materialId");
  const { user } = useAuth();
  const currentUserId = user?.uid || "guest-user";
  const { reprocessMaterial, deleteMaterial } = useMaterialIntake();

  const [material, setMaterial] = useState<Material | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [extraction, setExtraction] = useState<MaterialExtraction | null>(null);
  const [review, setReview] = useState<WorkspaceReview | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  // Modals state
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedChangesConfirm, setShowUnsavedChangesConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<"review" | "canvas_split" | "document_only" | "canvas_only">("review");

  const handleOpenCanvasWindow = () => {
    if (material) {
      navigate(`/canvas/${material.id}`);
    }
  };

  // Consolidated Main Screen Form State
  const [initialValues, setInitialValues] = useState<{
    title: string;
    content: string;
    summary: string;
    notes: string;
    relationships: ProposedRelationship[];
    action: "undecided" | "kept_separate" | "merged";
    targetConceptIds: string[];
  } | null>(null);

  const [currentTitle, setCurrentTitle] = useState("");
  const [currentContent, setCurrentContent] = useState("");
  const [currentSummary, setCurrentSummary] = useState("");
  const [currentNotes, setCurrentNotes] = useState("");
  const [relationships, setRelationships] = useState<ProposedRelationship[]>([]);
  const [currentAction, setCurrentAction] = useState<"undecided" | "kept_separate" | "merged">("undecided");
  const [currentTargetConceptIds, setCurrentTargetConceptIds] = useState<string[]>([]);

  // Sprint 6 (Requirement 7): Immutable file extension logic (only applies to files with extensions, not web links)
  const isLink = material?.type === "link";
  const immutableExt = material && !isLink
    ? (material.metadata?.extension || extractExtension(material.originalInput?.fileName || material.title))
    : "";

  const editableBaseName = isLink
    ? currentTitle
    : getBaseFileName(currentTitle, immutableExt);

  const handleBaseNameChange = (newBase: string) => {
    if (isLink) {
      setCurrentTitle(newBase);
    } else {
      const cleanBase = getBaseFileName(newBase, immutableExt);
      const fullFileName = enforceImmutableExtension(cleanBase, immutableExt);
      setCurrentTitle(fullFileName);
    }
  };

  // Requirement 2: ALWAYS OPEN MATERIAL AT THE TOP (scroll position = 0)
  useEffect(() => {
    const scrollToTop = () => {
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      const mainEl = document.querySelector("main");
      if (mainEl) {
        mainEl.scrollTop = 0;
      }
      const canvasEl = document.getElementById("material-canvas-view");
      if (canvasEl) {
        canvasEl.scrollTop = 0;
      }
    };

    scrollToTop();
    const rafId = requestAnimationFrame(scrollToTop);
    const timerId = setTimeout(scrollToTop, 50);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [materialId]);

  // Load material
  useEffect(() => {
    if (!materialId) return;

    let isMounted = true;
    setIsLoading(true);
    setInitialValues(null);
    setMaterial(null);
    setExtraction(null);
    setReview(null);

    getMaterialFromDb(materialId, currentUserId).then((mat) => {
      if (isMounted) {
        if (mat) {
          setMaterial(mat);
        }
        setIsLoading(false);
      }
    });

    const unsubMaterials = subscribeToUserMaterials(currentUserId, (list) => {
      if (isMounted) {
        setMaterials(list);
      }
      const found = list.find((m) => m.id === materialId);
      if (found && isMounted) {
        setMaterial(found);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubMaterials();
    };
  }, [materialId, currentUserId]);

  // Subscribe to extraction
  useEffect(() => {
    if (!materialId) return;
    const unsub = subscribeToExtraction(materialId, currentUserId, (ext) => {
      setExtraction(ext);
    });
    return () => unsub();
  }, [materialId, currentUserId]);

  // Subscribe to concepts
  useEffect(() => {
    const unsubConcepts = subscribeToUserConcepts(currentUserId, (cList) => {
      setConcepts(cList);
    });
    return () => unsubConcepts();
  }, [currentUserId]);

  // Subscribe to reviews and manage review state
  useEffect(() => {
    if (!materialId) return;

    const unsubReviews = subscribeToUserWorkspaceReviews(currentUserId, (reviews) => {
      const found = reviews.find((r) => r.materialId === materialId);
      if (found) {
        setReview(found);
        if (found.candidateConcepts?.length > 0 && !selectedConceptId) {
          setSelectedConceptId(found.candidateConcepts[0].conceptId);
        }
        if (found.status === "pending") {
          updateReviewStatus(found.id, currentUserId, "in_review").catch(console.warn);
        }
      } else if (material) {
        // If no review found and material is ready, generate one
        const generated = generateWorkspaceReview(material, extraction, concepts, materials);
        generated.status = "in_review";
        saveWorkspaceReview(generated).catch(console.warn);
        setReview(generated);
        if (generated.candidateConcepts?.length > 0) {
          setSelectedConceptId(generated.candidateConcepts[0].conceptId);
        }
      }
    });

    return () => unsubReviews();
  }, [materialId, currentUserId, material?.id, extraction?.id, concepts.length, materials.length]);

  // Initialize editable fields once loaded from database
  useEffect(() => {
    if (!material) return;
    if (initialValues !== null) return;

    const rawFileName = material.originalInput?.fileName || material.title || review?.materialTitle || "Untitled";
    const ext = isLink ? "" : (material.metadata?.extension || extractExtension(rawFileName));
    const initTitle = isLink ? rawFileName : enforceImmutableExtension(rawFileName, ext);
    const rawInitContent = extraction?.extractedText || (!isLink ? material.originalInput?.rawContent : "") || review?.proposedChanges?.suggestedContent || "";
    const isImageOrOcr = material.type === "image" || extraction?.pathwayUsed === "ocr" || rawInitContent.includes("<br") || rawInitContent.includes("^");
    const initContent = isImageOrOcr
      ? sanitizeOcrText(rawInitContent)
      : rawInitContent;
    const initSummary = review?.userDecision?.finalSummary ?? review?.proposedChanges?.suggestedSummary ?? "";
    const initNotes = review?.userDecision?.notes ?? "";
    const initRelationships = review?.proposedRelationships || [];
    const initAction: "undecided" | "kept_separate" | "merged" = 
      review?.userDecision?.action === "merged" 
        ? "merged" 
        : review?.userDecision?.action === "kept_separate"
        ? "kept_separate"
        : "undecided";
    const initTargetIds: string[] = review?.userDecision?.targetConceptIds || 
      (review?.userDecision?.targetConceptId ? [review.userDecision.targetConceptId] : []);

    setInitialValues({
      title: initTitle,
      content: initContent,
      summary: initSummary,
      notes: initNotes,
      relationships: initRelationships,
      action: initAction,
      targetConceptIds: initTargetIds,
    });

    setCurrentTitle(initTitle);
    setCurrentContent(initContent);
    setCurrentSummary(initSummary);
    setCurrentNotes(initNotes);
    setRelationships(initRelationships);
    setCurrentAction(initAction);
    setCurrentTargetConceptIds(initTargetIds);
  }, [material, review, extraction, initialValues, isLink]);

  // Live update extracted text when async extraction completes, if content was empty or raw URL
  useEffect(() => {
    if (extraction?.extractedText && (!currentContent || currentContent === material?.originalInput?.url)) {
      setCurrentContent(extraction.extractedText);
      setInitialValues((prev) => prev ? { ...prev, content: extraction.extractedText || "" } : null);
    }
  }, [extraction?.extractedText, material?.originalInput?.url]);

  // Precise dirty-state computation
  const isTitleDirty = initialValues ? currentTitle.trim() !== initialValues.title.trim() : false;
  const isContentDirty = initialValues ? currentContent.trim() !== initialValues.content.trim() : false;
  const isSummaryDirty = initialValues ? currentSummary.trim() !== initialValues.summary.trim() : false;
  const isNotesDirty = initialValues ? currentNotes.trim() !== initialValues.notes.trim() : false;
  
  const areRelationshipsDirty = initialValues ? (
    JSON.stringify(relationships.map((r) => ({
      sourceTitle: r.sourceTitle,
      targetTitle: r.targetTitle,
      targetConceptId: r.targetConceptId,
      relationType: r.relationType,
      groundingSource: r.groundingSource
    }))) !== JSON.stringify(initialValues.relationships.map((r) => ({
      sourceTitle: r.sourceTitle,
      targetTitle: r.targetTitle,
      targetConceptId: r.targetConceptId,
      relationType: r.relationType,
      groundingSource: r.groundingSource
    })))
  ) : false;

  const isActionDirty = initialValues ? currentAction !== initialValues.action : false;
  
  const areTargetsDirty = initialValues ? (
    currentAction === "merged" && (
      JSON.stringify([...currentTargetConceptIds].sort()) !== JSON.stringify([...initialValues.targetConceptIds].sort())
    )
  ) : false;

  const isDirty = Boolean(initialValues) && (
    isTitleDirty || 
    isContentDirty || 
    isSummaryDirty || 
    isNotesDirty || 
    areRelationshipsDirty || 
    isActionDirty || 
    areTargetsDirty
  );

  // Save relationships changes back to state (dirty state will react)
  const handleSaveRelationships = (newRelationships: ProposedRelationship[]) => {
    setRelationships(newRelationships);
  };

  // Keep Separate decision handler: executes immediately and updates state to resolved
  const handleKeepSeparate = async () => {
    if (!material || isSaving) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const finalFileName = enforceImmutableExtension(currentTitle.trim(), immutableExt);
      const effectiveReview = review || generateWorkspaceReview(material, extraction, concepts, materials);

      await executeReviewDecision(effectiveReview, {
        action: "kept_separate",
        finalTitle: finalFileName || material.title,
        finalSummary: currentSummary.trim(),
        finalContent: currentContent.trim(),
        relationships: relationships.map((r) => ({
          targetConceptId: r.targetConceptId,
          targetTitle: r.targetTitle,
          relationType: r.relationType,
          notes: r.groundingSource,
        })),
        userNotes: currentNotes.trim() || undefined,
        extractedVersionSnapshot: {
          extractionId: effectiveReview.extractionId,
          pathwayUsed: extraction?.pathwayUsed || "raw_input",
          completedAt: extraction?.completedAt,
        },
      });

      const updatedMaterial: Material = {
        ...material,
        title: finalFileName,
        processingStatus: "completed",
        updatedAt: now,
      };
      await saveMaterialToDb(updatedMaterial);
      setMaterial(updatedMaterial);

      setCurrentAction("kept_separate");
      setCurrentTargetConceptIds([]);
      setInitialValues(prev => prev ? { ...prev, action: "kept_separate", targetConceptIds: [] } : null);
    } catch (err) {
      console.error("Keep separate decision error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Revision / Merge decision handler from ReviseDecisionModal
  const handleSaveRevisedDecision = async (newAction: "kept_separate" | "merged", newTargetConceptIds: string[]) => {
    if (!material || isSaving) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const finalFileName = isLink ? currentTitle.trim() : enforceImmutableExtension(currentTitle.trim(), immutableExt);
      const effectiveReview = review || generateWorkspaceReview(material, extraction, concepts, materials);

      await executeReviewDecision(effectiveReview, {
        action: newAction,
        targetConceptId: newTargetConceptIds[0],
        targetConceptIds: newTargetConceptIds,
        finalTitle: finalFileName || material.title,
        finalSummary: currentSummary.trim(),
        finalContent: currentContent.trim(),
        relationships: relationships.map((r) => ({
          targetConceptId: r.targetConceptId,
          targetTitle: r.targetTitle,
          relationType: r.relationType,
          notes: r.groundingSource,
        })),
        userNotes: currentNotes.trim() || undefined,
        extractedVersionSnapshot: {
          extractionId: effectiveReview.extractionId,
          pathwayUsed: extraction?.pathwayUsed || "raw_input",
          completedAt: extraction?.completedAt,
        },
      });

      const updatedMaterial: Material = {
        ...material,
        title: finalFileName,
        processingStatus: "completed",
        updatedAt: now,
      };
      await saveMaterialToDb(updatedMaterial);
      setMaterial(updatedMaterial);

      setCurrentAction(newAction);
      setCurrentTargetConceptIds(newTargetConceptIds);
      setInitialValues(prev => prev ? { ...prev, action: newAction, targetConceptIds: newTargetConceptIds } : null);
      setShowReviseModal(false);
    } catch (err) {
      console.error("Save revised decision error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!material || isSaving) return;
    setIsSaving(true);
    try {
      const success = await deleteMaterial(material.id, currentUserId, material.blobStorageKey);
      if (success) {
        navigate("/");
      } else {
        throw new Error("Failed to delete material");
      }
    } catch (err) {
      console.error("Delete material error:", err);
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  // Direct save handler for title, extracted text, summary, and notes
  const handleSaveDraft = async () => {
    if (!isDirty || isSaving || !material) return;
    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const finalFileName = isLink ? currentTitle.trim() : enforceImmutableExtension(currentTitle.trim(), immutableExt);

      if (isTitleDirty) {
        const updatedMaterial: Material = {
          ...material,
          title: finalFileName,
          updatedAt: now,
        };
        await saveMaterialToDb(updatedMaterial);
        setMaterial(updatedMaterial);
      }

      if (isContentDirty && extraction) {
        const updatedExtraction: MaterialExtraction = {
          ...extraction,
          extractedText: currentContent.trim(),
          updatedAt: now,
        };
        await saveExtractionToDb(updatedExtraction);
        setExtraction(updatedExtraction);
      }

      if (review) {
        const updatedReview: WorkspaceReview = {
          ...review,
          materialTitle: finalFileName,
          proposedChanges: {
            ...review.proposedChanges,
            suggestedTitle: finalFileName,
            suggestedSummary: currentSummary.trim(),
            suggestedContent: currentContent.trim(),
          },
          proposedRelationships: relationships,
          updatedAt: now,
        };
        await saveWorkspaceReview(updatedReview);
        setReview(updatedReview);
      }

      setInitialValues({
        title: finalFileName,
        content: currentContent,
        summary: currentSummary,
        notes: currentNotes,
        relationships: relationships,
        action: currentAction,
        targetConceptIds: currentTargetConceptIds,
      });
    } catch (err) {
      console.error("Save draft error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty) {
      setShowUnsavedChangesConfirm(true);
    } else {
      navigate("/");
    }
  };

  if (isLoading && !material) {
    return (
      <div id="material-canvas-loading" className="min-h-screen bg-bg-main flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-text-secondary">
          <Loading  size={24} />
          <p className="text-sm">Opening material...</p>
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div id="material-canvas-not-found" className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Material not found</h2>
        <p className="text-xs text-text-secondary mb-4">The material you requested could not be located.</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-bg-surface border border-border-color text-text-primary hover:bg-bg-main transition-colors cursor-pointer"
        >
          Back to Materials
        </button>
      </div>
    );
  }

  // Format decision text for bottom pane
  const selectedTargetConcepts = concepts.filter((c) => currentTargetConceptIds.includes(c.id));
  const targetConceptTitles = selectedTargetConcepts.map((c) => c.title).join(", ");
  const isResolved = (review?.status === "resolved" || material?.processingStatus === "completed") && currentAction !== "undecided";

  return (
    <div id="material-canvas-view" className="min-h-screen bg-bg-main flex flex-col">
      {/* Top Header: Compact, clean layout with back button, editable filename, and save action */}
      <header className="sticky top-0 z-30 bg-bg-surface/95 backdrop-blur-md border-b border-border-color px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
          {/* Navigation Control (Back button without Alfassa label or breadcrumb) */}
          <button
            id="canvas-back-button"
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors shrink-0 cursor-pointer"
            title="Back to Materials"
            aria-label="Back to Materials"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            <span className="hidden xs:inline">Materials</span>
          </button>

          {/* Editable Filename & metadata */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex items-center rounded-lg border border-transparent hover:border-border-color focus-within:border-accent-highlight focus-within:ring-1 focus-within:ring-accent-highlight bg-transparent hover:bg-bg-subtle focus-within:bg-bg-surface transition-colors max-w-sm sm:max-w-md">
              <input
                id="material-title-header-input"
                type="text"
                value={editableBaseName}
                onChange={(e) => handleBaseNameChange(e.target.value)}
                className="text-xs sm:text-sm font-bold text-text-primary bg-transparent px-2 py-0.5 focus:outline-none truncate"
                title="Click to edit filename"
                placeholder="File name"
              />
              {immutableExt && (
                <span className="pr-2 text-xs sm:text-sm font-bold text-text-muted select-none shrink-0 font-mono">
                  .{immutableExt}
                </span>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                {material.type}
              </span>
              <span>·</span>
              <span className="text-[11px]">{formatRelativeTime(material.createdAt)}</span>
              {material.processingStatus === "processing" || material.processingStatus === "pending" ? (
                <>
                  <span>·</span>
                  <ProcessingIndicator size="xs" />
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right side header actions: Save button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="canvas-save-btn"
            type="button"
            onClick={handleSaveDraft}
            disabled={!isDirty || isSaving}
            className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              isDirty && !isSaving
                ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 shadow-xs"
                : "opacity-40 bg-bg-subtle border border-border-color text-text-muted cursor-not-allowed"
            }`}
            title="Save changes"
          >
            {isSaving ? <Loading size={13}  /> : <FloppyDisk size={13} />}
            <span>Save</span>
          </button>
        </div>
      </header>

      {/* Main Flexcil Workspace Area */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 pb-28 sm:pb-24">
        {workspaceViewMode === "canvas_split" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left Side: Source Material Pane */}
            <div className="space-y-6">
              <SourceMaterialPane 
                material={material} 
                extraction={extraction} 
                editableContent={currentContent}
                onContentChange={setCurrentContent}
                onOpenCanvas={handleOpenCanvasWindow}
                onReprocess={async () => {
                  if (material) {
                    await reprocessMaterial(material);
                  }
                }}
              />
            </div>

            {/* Right Side: Flexcil Canvas Note & Drawing Board */}
            <div className="space-y-6">
              <FlexcilCanvasBoard 
                material={material} 
                extraction={extraction}
              />
            </div>
          </div>
        )}

        {workspaceViewMode === "canvas_only" && (
          <div className="w-full">
            <FlexcilCanvasBoard 
              material={material} 
              extraction={extraction}
              className="min-h-[700px]"
            />
          </div>
        )}

        {workspaceViewMode === "document_only" && (
          <div className="max-w-4xl mx-auto">
            <SourceMaterialPane 
              material={material} 
              extraction={extraction} 
              editableContent={currentContent}
              onContentChange={setCurrentContent}
              onOpenCanvas={handleOpenCanvasWindow}
              onReprocess={async () => {
                if (material) {
                  await reprocessMaterial(material);
                }
              }}
            />
          </div>
        )}

        {workspaceViewMode === "review" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <SourceMaterialPane 
                material={material} 
                extraction={extraction} 
                editableContent={currentContent}
                onContentChange={setCurrentContent}
                onOpenCanvas={handleOpenCanvasWindow}
                onReprocess={async () => {
                  if (material) {
                    await reprocessMaterial(material);
                  }
                }}
              />
            </div>

            <div className="space-y-6">
              {/* Review Details Card */}
              <div 
                id="review-details-card" 
                className="p-4 sm:p-5 rounded-xl bg-bg-surface border border-border-color space-y-3.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Page size={16} strokeWidth={1.75} className="text-text-muted" />
                    <h3 className="text-sm font-bold text-text-primary">Review Details</h3>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="review-filename-input" className="block text-xs font-semibold text-text-primary">
                    File name
                  </label>
                  <div className="flex items-center rounded-lg border border-border-color bg-bg-surface focus-within:border-accent-highlight focus-within:ring-1 focus-within:ring-accent-highlight overflow-hidden transition-colors">
                    <input
                      id="review-filename-input"
                      type="text"
                      value={editableBaseName}
                      onChange={(e) => handleBaseNameChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-muted"
                      placeholder="File name"
                    />
                    {immutableExt && (
                      <span 
                        className="px-2.5 py-1.5 bg-bg-subtle text-text-muted border-l border-border-color text-xs font-mono font-medium select-none shrink-0" 
                        title={`Immutable extension: .${immutableExt}`}
                      >
                        .{immutableExt}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="review-summary-textarea" className="block text-xs font-semibold text-text-primary">
                    Summary
                  </label>
                  <textarea
                    id="review-summary-textarea"
                    rows={3}
                    value={currentSummary}
                    onChange={(e) => setCurrentSummary(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight transition-colors resize-y leading-relaxed placeholder:text-text-muted"
                    placeholder="Summary of this material..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="review-notes-textarea" className="block text-xs font-semibold text-text-primary">
                    Additional Notes
                  </label>
                  <textarea
                    id="review-notes-textarea"
                    rows={2}
                    value={currentNotes}
                    onChange={(e) => setCurrentNotes(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight transition-colors resize-y leading-relaxed placeholder:text-text-muted"
                    placeholder="Add notes, research context, or remarks..."
                  />
                </div>
              </div>

              <ProposedRelationshipsEditor
                relationships={relationships}
                onChangeRelationships={handleSaveRelationships}
                availableConcepts={concepts}
                materialTitle={currentTitle || material.title}
              />

              <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-red-800">Delete Material</span>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving}
                  className="h-8 px-4 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer shadow-xs"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sticky Bottom Decision Pane: Integrated directly into the material screen */}
      <footer 
        id="material-canvas-decision-pane"
        className="sticky bottom-0 z-40 bg-bg-surface/98 backdrop-blur-md border-t border-border-color shadow-md"
        style={{ paddingBottom: "max(0.6rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4">
          
          {/* Decision Status */}
          <div className="text-center sm:text-left min-w-0">
            <div className="flex items-center gap-1.5 justify-center sm:justify-start flex-wrap">
              <span className="text-xs text-text-muted">Decision:</span>
              <span className="text-xs font-bold text-text-primary">
                {!isResolved
                  ? "Pending"
                  : currentAction === "merged"
                  ? `Merged with "${targetConceptTitles || "selected concepts"}"`
                  : "Kept Separate"}
              </span>
            </div>
            {!isResolved && (
              <p className="text-[11px] text-text-muted mt-0.5">
                Review the extracted representation and choose whether to Keep Separate or Merge with existing knowledge.
              </p>
            )}
          </div>

            {/* Decision Controls:
              When pending: Keep Separate and Merge buttons
              When resolved: Revise decision button (do not keep displaying pending-decision controls for resolved materials) */}
          <div className="flex items-center gap-2 flex-wrap justify-center shrink-0 w-full sm:w-auto">
            {!isResolved ? (
              <>
                <button
                  id="decision-choose-separate-btn"
                  type="button"
                  onClick={handleKeepSeparate}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none h-9 px-4 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer text-center flex items-center justify-center shadow-2xs"
                  title="Keep Separate"
                >
                  Keep Separate
                </button>

                <button
                  id="decision-choose-merge-btn"
                  type="button"
                  onClick={() => setShowReviseModal(true)}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none h-9 px-4 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer text-center flex items-center justify-center shadow-2xs"
                  title="Merge"
                >
                  Merge
                </button>
              </>
            ) : (
              <button
                id="decision-revise-btn"
                type="button"
                onClick={() => setShowReviseModal(true)}
                className="flex-1 sm:flex-none h-9 px-4 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer text-center flex items-center justify-center shadow-2xs"
                title="Revise decision"
              >
                Revise decision
              </button>
            )}
          </div>

        </div>
      </footer>

      {/* Revise Decision Modal (Simplified: only handles decision switch and merge target selection) */}
      {showReviseModal && (
        <ReviseDecisionModal
          isOpen={true}
          onClose={() => setShowReviseModal(false)}
          review={review}
          currentDecisionAction={currentAction}
          currentTargetConceptIds={currentTargetConceptIds}
          concepts={concepts}
          materials={materials}
          onSaveDecision={handleSaveRevisedDecision}
          onViewHistory={() => setShowHistoryModal(true)}
        />
      )}

      {/* Decision History Modal */}
      {showHistoryModal && review && (
        <DecisionHistoryModal
          isOpen={true}
          onClose={() => setShowHistoryModal(false)}
          review={review}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-bg-surface border border-border-color rounded-xl w-full max-w-sm p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Confirm Deletion</h3>
            <p className="text-xs text-text-secondary">Are you sure you want to permanently delete this material? This action cannot be undone.</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSaving}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSaving ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedChangesConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-bg-surface border border-border-color rounded-xl w-full max-w-sm p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Unsaved Changes</h3>
            <p className="text-xs text-text-secondary">You have unsaved changes. Do you want to save them before going back, or discard them?</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUnsavedChangesConfirm(false)}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowUnsavedChangesConfirm(false); navigate("/"); }}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={async () => { await handleSaveDraft(); setShowUnsavedChangesConfirm(false); navigate("/"); }}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-accent-highlight text-white hover:bg-accent-highlight-dark transition-colors cursor-pointer shadow-xs"
              >
                Save & Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
