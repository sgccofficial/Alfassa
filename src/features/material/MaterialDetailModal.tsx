import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  X, 
  FileText, 
  Mic, 
  Globe, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink,
  Download,
  AlertCircle
} from "lucide-react";
import { Material, MaterialExtraction } from "../../types";
import { getMaterialBlob } from "../../services/blob-store";
import { subscribeToExtraction } from "../../services/extraction-db";
import { StructuredTableView } from "../../shared/components/StructuredTableView";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { PdfInlinePreview } from "./PdfInlinePreview";
import { Table as TableIcon } from "lucide-react";

interface MaterialDetailModalProps {
  material: Material | null;
  extraction?: MaterialExtraction | null;
  isOpen: boolean;
  onClose: () => void;
  onReprocess?: (materialOrId: Material | string) => Promise<any>;
  onDelete?: () => Promise<void>;
}

export function MaterialDetailModal({
  material,
  extraction: propExtraction,
  isOpen,
  onClose,
  onReprocess,
  onDelete,
}: MaterialDetailModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"original" | "extracted">("original");
  const [extractedFormatMode, setExtractedFormatMode] = useState<"text" | "table">("text");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [rawBlob, setRawBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [fetchedExtraction, setFetchedExtraction] = useState<MaterialExtraction | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Reset to original tab whenever a new material opens
  useEffect(() => {
    setActiveTab("original");
  }, [material?.id]);

  // Subscribe to extraction if not provided as prop
  useEffect(() => {
    if (propExtraction !== undefined || !material) {
      setFetchedExtraction(null);
      return;
    }

    const unsub = subscribeToExtraction(material.id, material.userId, (ext) => {
      setFetchedExtraction(ext);
    });

    return () => unsub();
  }, [material?.id, material?.userId, propExtraction]);

  const extraction = propExtraction !== undefined ? propExtraction : fetchedExtraction;

  useEffect(() => {
    if (!material?.originalInput?.blobStorageKey) {
      setBlobUrl(null);
      setRawBlob(null);
      return;
    }

    let active = true;
    let url: string | null = null;
    getMaterialBlob(material.originalInput.blobStorageKey)
      .then((blob) => {
        if (active && blob) {
          setRawBlob(blob);
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      })
      .catch((err) => console.warn("Failed to load blob:", err));

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [material?.id, material?.originalInput?.blobStorageKey]);

  if (!isOpen || !material) return null;

  const handleCopyText = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerReprocess = async () => {
    if (!onReprocess || isReprocessing || !material) return;
    setIsReprocessing(true);
    try {
      await onReprocess(material);
    } catch (err) {
      console.error("Reprocess error:", err);
    } finally {
      setIsReprocessing(false);
    }
  };

  const mediaSource = blobUrl || material?.originalInput?.dataUrl;
  const hasExtractedText = Boolean(extraction?.extractedText && extraction.extractedText.trim().length > 0);
  const effectiveStatus = isReprocessing 
    ? "processing" 
    : (extraction?.processingStatus || material.processingStatus || "pending");

  const ext = (
    material.metadata?.extension || 
    (material.originalInput?.fileName ? material.originalInput.fileName.split(".").pop() : "") || 
    ""
  ).toLowerCase();
  const isPdf = ext === "pdf" || material.metadata?.mimeType === "application/pdf" || material.originalInput?.fileType === "application/pdf";
  const isDocumentType = material.type === "document" || ["pdf", "doc", "docx", "ppt", "pptx", "txt", "md"].includes(ext);

  const isAudio = material.type === "audio";
  const isVideo = material.type === "video";
  const isMedia = isAudio || isVideo;

  const processingMessage = isAudio 
    ? "Transcribing audio…" 
    : isVideo 
    ? "Transcribing video…" 
    : "Extracting text…";

  const partialMessage = isMedia
    ? "Transcription is incomplete."
    : "Extraction incomplete — some pages or slides had no readable text.";

  const failedMessage = isMedia
    ? "Transcription couldn't be completed yet."
    : "Text couldn't be extracted yet.";

  const contentLabel = isMedia ? "Transcript" : "Extracted Text";

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4 md:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        id="material-detail-modal"
        className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl bg-bg-surface sm:border sm:border-border-color sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Simple Material Viewer Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-3 border-b border-border-color flex items-center justify-between gap-3 shrink-0 bg-bg-surface">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button 
              onClick={onClose}
              className="p-1 -ml-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-subtle transition-colors shrink-0 cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h2 className="text-sm sm:text-base font-bold text-text-primary truncate">
              {material.title}
            </h2>
          </div>
        </div>

        {/* Tab Controls: Extracted Text | Original */}
        <div className="px-4 sm:px-6 border-b border-border-color bg-bg-subtle/50 flex items-center gap-5 shrink-0">
          <button
            onClick={() => setActiveTab("original")}
            className={`py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "original"
                ? "border-slate-900 dark:border-slate-100 text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Original
          </button>
          <button
            onClick={() => setActiveTab("extracted")}
            className={`py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "extracted"
                ? "border-slate-900 dark:border-slate-100 text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Extracted Content
          </button>
        </div>

        {/* Viewer Main Surface */}
        <div className="flex-1 overflow-auto bg-bg-surface p-4 sm:p-6 flex flex-col min-h-0">
          {activeTab === "original" ? (
            /* ORIGINAL VIEW */
            <div className="flex-1 flex flex-col min-h-0 w-full">
              {material.type === "image" && (
                <div className="flex-1 w-full h-full flex items-center justify-center overflow-auto min-h-[300px]">
                  {mediaSource ? (
                    <img 
                      src={mediaSource} 
                      alt={material.title} 
                      className="max-w-full max-h-[calc(100vh-210px)] sm:max-h-[65vh] object-contain rounded-lg border border-border-color/60 shadow-2xs select-none"
                    />
                  ) : (
                    <div className="text-xs text-text-muted flex items-center gap-2">
                      <span className="inline-block w-3.5 h-3.5 border-2 border-accent-highlight border-t-transparent rounded-full animate-spin" />
                      Loading original image...
                    </div>
                  )}
                </div>
              )}

              {material.type === "audio" && mediaSource && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3">
                  <div className="p-3 rounded-xl bg-bg-subtle border border-border-color text-text-secondary">
                    <Mic size={24} strokeWidth={1.75} />
                  </div>
                  <audio controls src={mediaSource} className="w-full max-w-md" />
                </div>
              )}

              {material.type === "video" && mediaSource && (
                <div className="flex-1 w-full h-full flex items-center justify-center overflow-auto min-h-[300px]">
                  <video 
                    controls 
                    src={mediaSource} 
                    className="max-w-full max-h-[calc(100vh-210px)] sm:max-h-[65vh] object-contain rounded-lg border border-border-color/60"
                  />
                </div>
              )}

              {material.type === "link" && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3 text-center">
                  <div className="p-3 rounded-xl bg-bg-subtle border border-border-color text-text-secondary">
                    <Globe size={24} strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <span className="text-[11px] font-medium text-text-muted block">Original Link</span>
                    <a 
                      href={material?.originalInput?.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-accent-highlight font-mono text-xs sm:text-sm underline flex items-center justify-center gap-1.5 break-all hover:opacity-80"
                    >
                      {material?.originalInput?.url || "No link URL provided"}
                      <ExternalLink size={13} className="shrink-0" />
                    </a>
                  </div>
                </div>
              )}

              {/* PDF Document Inline Preview (Sprint 6: no giant Open button, no raw URL/token leaks) */}
              {isPdf && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2">
                  <PdfInlinePreview
                    material={material}
                    blob={rawBlob}
                    mediaSource={mediaSource}
                    sampleText={extraction?.extractedText || material.originalInput?.rawContent}
                    onOpenInCanvas={() => {
                      onClose();
                      navigate(`/material/${material.id}`);
                    }}
                  />
                </div>
              )}

              {/* Non-PDF Document in Modal (DOC, DOCX, PPT, PPTX) */}
              {!isPdf && isDocumentType && mediaSource && !material.originalInput?.rawContent && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3 text-center">
                  <div className="p-3 rounded-xl bg-bg-subtle border border-border-color text-text-primary">
                    <FileText size={24} strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-text-primary">
                      {material.originalInput?.fileName || material.title}
                    </p>
                    <p className="text-xs text-text-muted">
                      Original document preserved in workspace
                    </p>
                  </div>
                  <a
                    href={mediaSource}
                    download={material.originalInput?.fileName || `${material.title}.${ext || "bin"}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-primary transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Download original</span>
                  </a>
                </div>
              )}

              {material?.originalInput?.rawContent ? (
                <div className="flex-1 flex flex-col min-h-0 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>Original Content</span>
                    <button
                      onClick={() => handleCopyText(material.originalInput?.rawContent)}
                      className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="flex-1 p-3.5 rounded-xl bg-bg-subtle border border-border-color font-mono text-xs text-text-primary whitespace-pre-wrap overflow-auto select-text">
                    {material.originalInput.rawContent}
                  </div>
                </div>
              ) : material.type === "document" && !mediaSource ? (
                <div className="flex-1 flex items-center justify-center p-6 text-xs text-text-muted">
                  Document preserved in your workspace.
                </div>
              ) : null}
            </div>
          ) : (
            /* EXTRACTED CONTENT VIEW */
            <div className="flex-1 flex flex-col min-h-0 w-full">
              {effectiveStatus === "processing" ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="p-2.5 rounded-full bg-bg-subtle border border-border-color text-text-primary">
                    <RefreshCw size={20} className="animate-spin" />
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-text-primary">{processingMessage}</p>
                </div>
              ) : hasExtractedText ? (
                <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
                  {effectiveStatus === "partially_completed" && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-bg-subtle border border-border-color text-xs text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle size={14} className="text-amber-500 shrink-0" />
                        <span>{partialMessage}</span>
                      </div>
                      {onReprocess && (
                        <button
                          type="button"
                          onClick={handleTriggerReprocess}
                          disabled={isReprocessing}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-primary transition-colors cursor-pointer"
                        >
                          <RefreshCw size={10} className={isReprocessing ? "animate-spin" : ""} />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary">
                        {contentLabel}
                      </span>
                      {extraction?.ocrResult?.tables && extraction.ocrResult.tables.length > 0 && (
                        <div className="inline-flex items-center p-0.5 bg-bg-subtle rounded border border-border-color text-[11px]">
                          <button
                            type="button"
                            onClick={() => setExtractedFormatMode("text")}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              extractedFormatMode === "text"
                                ? "bg-bg-surface text-text-primary font-semibold shadow-2xs"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            Text
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtractedFormatMode("table")}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              extractedFormatMode === "table"
                                ? "bg-bg-surface text-text-primary font-semibold shadow-2xs"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            <TableIcon size={11} />
                            Table Grid
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleCopyText(extraction?.extractedText)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  {extractedFormatMode === "table" && extraction?.ocrResult?.tables && extraction.ocrResult.tables.length > 0 ? (
                    <div className="flex-1 overflow-auto">
                      <StructuredTableView tables={extraction.ocrResult.tables} />
                    </div>
                  ) : (
                    <div className="flex-1 p-3.5 rounded-xl bg-bg-subtle border border-border-color font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap overflow-auto select-text">
                      {extraction?.extractedText}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <p className="text-xs sm:text-sm font-semibold text-text-primary">{failedMessage}</p>
                  {onReprocess && (
                    <button
                      onClick={handleTriggerReprocess}
                      disabled={isReprocessing}
                      className="h-8 px-3 rounded-lg text-xs font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-primary transition-colors cursor-pointer"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer with Unclipped Actions */}
        <div className="px-4 py-3 sm:px-6 sm:py-3 border-t border-border-color flex items-center justify-between gap-3 shrink-0 bg-bg-surface">
          <button
            onClick={onClose}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            Done
          </button>
          <div className="flex items-center gap-3">
            {onDelete && (
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                Delete
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                navigate(`/review?materialId=${material.id}`);
              }}
              className="h-9 px-4 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              Review &rarr;
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete Material"
        message="Are you sure you want to delete this material? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={async () => {
          if (onDelete) {
            await onDelete();
            onClose();
          }
        }}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </div>
  );
}
