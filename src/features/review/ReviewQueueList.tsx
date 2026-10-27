import React from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Clock, ArrowRight, Page, BookStack, Globe, Microphone, MediaVideo, MediaImage as ImageIcon } from "iconoir-react";
import { Material, WorkspaceReview } from "../../types";
import { ProcessingIndicator } from "../../shared/components/ProcessingIndicator";

function getMaterialIcon(type?: string) {
  switch (type) {
    case "audio":
      return <Microphone size={16} strokeWidth={1.75} />;
    case "video":
      return <MediaVideo size={16} strokeWidth={1.75} />;
    case "image":
      return <ImageIcon size={16} strokeWidth={1.75} />;
    case "link":
      return <Globe size={16} strokeWidth={1.75} />;
    case "document":
    case "text":
    default:
      return <Page size={16} strokeWidth={1.75} />;
  }
}

interface ReviewQueueListProps {
  materials: Material[];
  reviews: WorkspaceReview[];
  onSelectReview: (materialId: string) => void;
}

export function ReviewQueueList({
  materials,
  reviews,
  onSelectReview,
}: ReviewQueueListProps) {
  const navigate = useNavigate();
  // Match each material with its review record if exists
  const reviewMap = new Map(reviews.map((r) => [r.materialId, r]));

  const pendingMaterials = materials.filter((m) => {
    const rev = reviewMap.get(m.id);
    return !rev || rev.status !== "resolved";
  });

  const resolvedReviews = reviews.filter((r) => r.status === "resolved");

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-2">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Workspace Review</h1>
        <p className="text-xs text-text-muted mt-1">
          Review extracted representations, candidate concepts, and relationships before integration.
        </p>
      </div>

      {/* Pending Reviews Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Clock size={16} strokeWidth={1.75} className="text-text-muted" />
            Ready for Review
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg-subtle border border-border-color text-text-primary">
            {pendingMaterials.length}
          </span>
        </div>

        {pendingMaterials.length === 0 ? (
          <div className="bg-bg-surface border border-border-color rounded-xl p-8 text-center shadow-2xs">
            <p className="text-xs text-text-muted font-medium">Review queue is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {pendingMaterials.map((mat) => {
              const rev = reviewMap.get(mat.id);
              const status = rev ? rev.status : "pending";

              return (
                <div
                  key={mat.id}
                  onClick={() => onSelectReview(mat.id)}
                  className="bg-bg-surface border border-border-color hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-4 cursor-pointer transition-colors shadow-2xs group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-bg-subtle border border-border-color text-text-muted shrink-0">
                      {getMaterialIcon(mat.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs sm:text-sm font-bold text-text-primary truncate">
                          {mat.title}
                        </h3>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-bg-subtle border border-border-color text-text-muted shrink-0">
                          {mat.type}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted truncate mt-0.5">
                        {rev?.proposedChanges?.rationale || "Extracted and prepared for review"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {mat.processingStatus === "processing" || mat.processingStatus === "pending" ? (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-bg-subtle border border-border-color">
                        <ProcessingIndicator size="xs" />
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-bg-subtle border border-border-color text-text-muted">
                        {status === "in_review" ? "In Review" : "Pending"}
                      </span>
                    )}
                    <ArrowRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resolved Reviews Section - Directly visible on page */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <CheckCircle size={16} strokeWidth={1.75} className="text-emerald-500" />
            Resolved Reviews
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg-subtle border border-border-color text-text-primary">
            {resolvedReviews.length}
          </span>
        </div>

        {resolvedReviews.length === 0 ? (
          <div className="bg-bg-surface border border-border-color rounded-xl p-6 text-center text-xs text-text-muted shadow-2xs">
            No resolved reviews yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {resolvedReviews.map((rev) => {
              const mat = materials.find((m) => m.id === rev.materialId);
              const matType = mat?.type || "Material";
              const decisionText = rev.userDecision?.action === "merged"
                ? `Merged with "${rev.userDecision.finalTitle}"`
                : "Kept Separate";

              return (
                <div
                  key={rev.id}
                  onClick={() => onSelectReview(rev.materialId)}
                  className="bg-bg-surface border border-border-color hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-4 cursor-pointer transition-colors shadow-2xs group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-bg-subtle border border-border-color text-emerald-500 shrink-0">
                      <CheckCircle size={16} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-text-primary truncate">
                        {rev.materialTitle}
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        <span className="capitalize">{matType}</span> · <span>{decisionText}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {rev.userDecision?.resultingConceptId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/concept/${rev.userDecision?.resultingConceptId}`);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-subtle hover:bg-slate-200 dark:hover:bg-slate-800 text-text-primary border border-border-color transition-colors inline-flex items-center gap-1 cursor-pointer"
                        title="View accepted Concept in Knowledge Base"
                      >
                        <BookStack size={12} strokeWidth={1.75} />
                        <span>View Concept</span>
                      </button>
                    )}
                    <ArrowRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
