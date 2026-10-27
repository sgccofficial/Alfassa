import React from "react";
import { Material, MaterialType } from "../../types";
import { Page, MediaVideo, Microphone, Globe, MediaImage as ImageIcon, Attachment, Refresh } from "iconoir-react";
import { ProcessingIndicator } from "./ProcessingIndicator";

export function capitalizeMaterialType(type?: string): string {
  if (!type) return "Document";
  const lower = type.toLowerCase();
  switch (lower) {
    case "document": return "Document";
    case "video": return "Video";
    case "image": return "Image";
    case "audio": return "Audio";
    case "website":
    case "link": return "Website";
    case "spreadsheet": return "Spreadsheet";
    case "presentation": return "Presentation";
    case "text": return "Document";
    default: return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
}

export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "just now";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSecs < 60) return "just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
  } catch {
    return "recently";
  }
}

export function getMaterialIcon(type?: MaterialType) {
  switch (type) {
    case "image":
      return <ImageIcon size={18} strokeWidth={1.5} />;
    case "video":
      return <MediaVideo size={18} strokeWidth={1.5} />;
    case "audio":
      return <Microphone size={18} strokeWidth={1.5} />;
    case "link":
      return <Globe size={18} strokeWidth={1.5} />;
    case "document":
    case "text":
      return <Page size={18} strokeWidth={1.5} />;
    default:
      return <Attachment size={18} strokeWidth={1.5} />;
  }
}

interface MaterialRowProps {
  key?: React.Key;
  material: Material;
  onClick?: () => void;
  onOpen?: () => void;
  onRetry?: () => void;
  showOpenAction?: boolean;
}

export function MaterialRow({
  material,
  onClick,
  onOpen,
  onRetry,
  showOpenAction = false,
}: MaterialRowProps) {
  const isSavingOrUploading = material.status === "saving" || material.status === "uploading";
  const isProcessing = material.processingStatus === "processing";
  const hasError = material.status === "processing_failed" || material.processingStatus === "failed";
  const percentage = material.uploadProgress?.percentage;

  // Render Status Badge for Line 1 Right Column
  const renderStatus = () => {
    if (isSavingOrUploading) {
      return (
        <span className="text-[11px] text-text-secondary font-medium shrink-0">
          {material.uploadProgress?.state === "uploading" ? "Uploading..." : "Saving..."}
        </span>
      );
    }
    if (isProcessing) {
      return (
        <span className="shrink-0">
          <ProcessingIndicator size="xs" />
        </span>
      );
    }
    if (hasError) {
      return (
        <span className="text-[11px] text-red-500 font-semibold shrink-0">
          Needs attention
        </span>
      );
    }
    if (material.processingStatus === "completed") {
      return (
        <span className="text-[11px] text-text-secondary font-medium shrink-0">
          Ready
        </span>
      );
    }
    if (material.processingStatus === "partially_completed") {
      return (
        <span className="text-[11px] text-text-secondary font-medium shrink-0">
          Partial
        </span>
      );
    }
    return (
      <span className="text-[11px] text-text-secondary font-medium shrink-0">
        {material.status === "upload_complete" ? "Saved" : "Pending"}
      </span>
    );
  };

  return (
    <div
      onClick={onClick}
      className="p-3.5 rounded-xl bg-bg-surface border border-border-color hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs transition-all cursor-pointer flex items-start gap-3 group w-full"
    >
      {/* File Icon */}
      <div className="p-2 rounded-lg bg-bg-subtle text-text-primary shrink-0 mt-0.5">
        {getMaterialIcon(material.type)}
      </div>

      {/* Main Row Content Split into Left and Right Columns */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* ROW 1: Filename (Left) & Status / Action (Right) */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <h4 className="text-xs sm:text-sm font-semibold text-text-primary truncate min-w-0 flex-1 group-hover:text-text-primary transition-colors">
            {material.title}
          </h4>

          <div className="shrink-0 flex items-center justify-end">
            {showOpenAction ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen?.();
                }}
                className="inline-flex items-center gap-1 font-semibold text-xs text-text-primary hover:text-accent-highlight transition-colors cursor-pointer"
              >
                Open &rarr;
              </button>
            ) : (
              renderStatus()
            )}
          </div>
        </div>

        {/* ROW 2: Material type · Added time (Left) & Progress Indicator (Right) */}
        <div className="flex items-center justify-between gap-3 text-[11px] min-w-0">
          {/* LEFT: Capitalized Type · Added timestamp */}
          <div className="text-text-muted truncate min-w-0 flex-1">
            <span>{capitalizeMaterialType(material.type)}</span>
            <span> · </span>
            {isSavingOrUploading ? (
              <span>{material.uploadProgress?.state === "uploading" ? "Uploading..." : "Saving..."}</span>
            ) : (
              <span>Added {formatRelativeTime(material.createdAt)}</span>
            )}
          </div>

          {/* RIGHT: Percentage or status detail directly beneath status */}
          <div className="shrink-0 text-right">
            {isSavingOrUploading && percentage !== undefined && (
              <span className="text-[10px] font-mono text-text-muted">{percentage}%</span>
            )}
          </div>
        </div>

        {/* Progress Bar directly beneath Line 2 for active operations */}
        {(isProcessing || isSavingOrUploading) && (
          <div className="w-full bg-bg-subtle h-1.5 rounded-full overflow-hidden border border-border-color/60 mt-1">
            {isSavingOrUploading && percentage !== undefined ? (
              <div
                className="bg-accent-highlight h-full rounded-full transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              />
            ) : (
              <div className="bg-accent-highlight h-full rounded-full animate-pulse w-2/3" />
            )}
          </div>
        )}

        {/* Error Details & Retry */}
        {hasError && (
          <div className="pt-1.5 border-t border-border-color/50 flex items-center justify-between gap-2 text-[11px] mt-1">
            <span className="text-text-secondary truncate">
              {material.errorDetail?.stage === "saving"
                ? "Failed saving original"
                : material.errorDetail?.stage === "retrieval"
                ? "Failed reading original"
                : "Extraction failed - Original preserved"}
            </span>
            {material.status !== "processing_failed" && onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400 cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Refresh size={11} />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
