import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FileText, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Mic, 
  Globe, 
  Paperclip, 
  ExternalLink,
  Copy,
  Check,
  AlignLeft,
  Layers,
  RefreshCw,
  Download,
  AlertCircle
} from "lucide-react";
import { Material, MaterialExtraction } from "../../../types";
import { useMaterialOriginalFile } from "../../../services/material-file-loader";
import { sanitizeOcrText } from "../../../shared/utils/ocr-sanitizer";
import { StructuredTableView } from "../../../shared/components/StructuredTableView";
import { PdfInlinePreview } from "../../material/PdfInlinePreview";
import { Table as TableIcon } from "lucide-react";

interface SourceMaterialPaneProps {
  material: Material;
  extraction?: MaterialExtraction | null;
  onReprocess?: () => Promise<any>;
  editableContent?: string;
  onContentChange?: (newContent: string) => void;
  onOpenCanvas?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function SourceMaterialPane({ 
  material, 
  extraction, 
  onReprocess,
  editableContent,
  onContentChange,
  onOpenCanvas 
}: SourceMaterialPaneProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"original" | "extracted">("original");
  const [extractedFormatMode, setExtractedFormatMode] = useState<"text" | "table">("text");
  const [copied, setCopied] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Robust original file loader (Sprint 8: strict binary sourcing, MIME type guarantee, stable lifecycle)
  const {
    blob: rawBlob,
    mediaSource,
    isLoading: isFileLoading,
    error: fileError,
    retry: retryFileLoad,
  } = useMaterialOriginalFile(material);
  
  useEffect(() => {
    console.log("SourceMaterialPane: file loading state", { isFileLoading, fileError, mediaSource, materialType: material.type });
  }, [isFileLoading, fileError, mediaSource, material.type]);

  const handleCopy = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReprocessClick = async () => {
    if (!onReprocess || isReprocessing) return;
    setIsReprocessing(true);
    try {
      await onReprocess();
    } catch (err) {
      console.error("Re-extraction attempt failed:", err);
    } finally {
      setIsReprocessing(false);
    }
  };

  const getIcon = () => {
    switch (material.type) {
      case "document": return <FileText size={18} strokeWidth={1.5} />;
      case "image": return <ImageIcon size={18} strokeWidth={1.5} />;
      case "video": return <VideoIcon size={18} strokeWidth={1.5} />;
      case "audio": return <Mic size={18} strokeWidth={1.5} />;
      case "link": return <Globe size={18} strokeWidth={1.5} />;
      default: return <Paperclip size={18} strokeWidth={1.5} />;
    }
  };

  const headings = extraction?.documentStructure?.headings || [];
  const rawTextContent = (extraction?.extractedText || "").trim();
  const isImageOrOcr = material.type === "image" || extraction?.pathwayUsed === "ocr" || rawTextContent.includes("<br") || rawTextContent.includes("^");
  const textContent = isImageOrOcr ? sanitizeOcrText(rawTextContent) : rawTextContent;
  const activeContent = editableContent !== undefined
    ? ((isImageOrOcr || editableContent.includes("<br") || editableContent.includes("^")) ? sanitizeOcrText(editableContent) : editableContent)
    : textContent;
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

  const failedMessage = effectiveStatus === "failed" && extraction?.error?.message
    ? (extraction.error.message.includes("unavailable") || extraction.error.message.includes("retrieved")
        ? "Original file could not be retrieved from workspace storage."
        : extraction.error.message)
    : (isMedia
        ? "Transcription couldn't be completed yet."
        : "Text couldn't be extracted yet.");

  const contentLabel = isMedia ? "Transcript" : "Extracted Text";

  return (
    <div className="bg-bg-surface border border-border-color rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
      {/* Pane Header with Switchable Tabs & Open Canvas Action */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">
            {getIcon()}
          </span>
          <h3 className="text-sm font-bold text-text-primary">Source Material</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Open Canvas button */}
          <button
            id="pane-open-canvas-btn"
            type="button"
            onClick={() => {
              setActiveTab("extracted");
              if (onOpenCanvas) {
                onOpenCanvas();
              }
            }}
            className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-bg-surface hover:bg-bg-subtle border border-border-color text-text-primary transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Open Material Canvas editing tools"
          >
            <Layers size={13} className="text-text-muted" />
            <span>Open Canvas</span>
          </button>

          {/* Tab Controls: Original vs Extracted Content */}
          <div className="inline-flex items-center p-0.5 bg-bg-subtle rounded-lg border border-border-color text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("original")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "original"
                  ? "bg-bg-surface text-text-primary shadow-2xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("extracted")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "extracted"
                  ? "bg-bg-surface text-text-primary shadow-2xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Extracted Content
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: Original Material (Preserved verbatim without modification) */}
      {activeTab === "original" && (
        <div className="space-y-3">
          {/* Loading state while retrieving original file binary (Requirement 9) */}
          {isFileLoading && !material.originalInput?.rawContent && material.type !== "link" && (
            <div className="p-10 rounded-lg bg-bg-subtle border border-border-color flex flex-col items-center justify-center min-h-[300px] text-text-muted text-xs gap-3">
              <RefreshCw size={20} className="animate-spin text-text-muted" />
              <p>Loading original file…</p>
            </div>
          )}

          {/* Failure state if retrieval failed (for non-PDF materials) */}
          {!isFileLoading && !isPdf && (!mediaSource || fileError) && !material.originalInput?.rawContent && material.type !== "link" && (
            <div className="p-8 rounded-lg bg-bg-subtle border border-border-color flex flex-col items-center justify-center min-h-[260px] text-center gap-3 max-w-md mx-auto">
              <div className="p-2.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertCircle size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-primary">
                  Unable to load this file.
                </h4>
              </div>
              <button
                type="button"
                onClick={retryFileLoad}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Image */}
          {!isFileLoading && material.type === "image" && mediaSource && (
            <div className="p-3 sm:p-4 rounded-lg bg-bg-subtle border border-border-color flex justify-center items-center overflow-hidden min-h-[300px]">
              <img 
                src={mediaSource} 
                alt={material.title} 
                className="max-h-[70vh] w-auto max-w-full rounded-md object-contain shadow-2xs select-none"
              />
            </div>
          )}

          {/* PDF Document Inline Preview (Sprint 6 & 8: Authentic original PDF view with page scrolling and zoom) */}
          {!isFileLoading && isPdf && (
            <PdfInlinePreview
              material={material}
              blob={rawBlob}
              mediaSource={mediaSource}
              onOpenCanvas={() => {
                if (onOpenCanvas) onOpenCanvas();
                else navigate(`/material/${material.id}`);
              }}
            />
          )}

          {/* Non-PDF Document (DOC, DOCX, PPT, PPTX) - Requirement 8: clear preview placeholder with Open Canvas */}
          {!isFileLoading && !isPdf && isDocumentType && mediaSource && !material.originalInput?.rawContent && (
            <div className="p-8 rounded-lg bg-bg-subtle border border-border-color flex flex-col items-center justify-center gap-3 text-center">
              <div className="p-2.5 rounded-lg bg-bg-surface border border-border-color text-text-primary">
                <FileText size={24} strokeWidth={1.75} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs sm:text-sm font-semibold text-text-primary">
                  {material.originalInput?.fileName || material.title}
                </h4>
                <p className="text-[11px] text-text-muted">
                  {(ext || "document").toUpperCase()} presentation file
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("extracted");
                    if (onOpenCanvas) onOpenCanvas();
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-bg-surface hover:bg-bg-subtle border border-border-color text-text-primary transition-colors cursor-pointer"
                >
                  <Layers size={13} className="text-text-muted" />
                  <span>Open Canvas</span>
                </button>
                <a
                  href={mediaSource}
                  download={material.originalInput?.fileName || `${material.title}.${ext || "bin"}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download original file</span>
                </a>
              </div>
            </div>
          )}

          {/* Audio */}
          {!isFileLoading && material.type === "audio" && mediaSource && (
            <div className="p-5 rounded-lg bg-bg-subtle border border-border-color flex flex-col items-center justify-center gap-3">
              <audio controls src={mediaSource} className="w-full max-w-md" />
            </div>
          )}

          {/* Video */}
          {!isFileLoading && material.type === "video" && mediaSource && (
            <div className="p-3 rounded-lg bg-bg-subtle border border-border-color flex justify-center">
              <video controls src={mediaSource} className="max-h-[500px] w-full rounded-md" />
            </div>
          )}

          {/* Link */}
          {material.type === "link" && material?.originalInput?.url && (
            <div className="p-3 rounded-lg bg-bg-subtle border border-border-color flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-accent-highlight truncate">
                {material.originalInput.url}
              </span>
              <a 
                href={material.originalInput.url} 
                target="_blank" 
                rel="noreferrer"
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
                title="Open link"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          )}

          {/* Plain Text Content (Preserved verbatim) */}
          {material?.originalInput?.rawContent && material.type !== "image" && material.type !== "link" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-medium">Text Content</span>
                <button
                  type="button"
                  onClick={() => handleCopy(material.originalInput?.rawContent)}
                  className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="p-3 rounded-lg bg-bg-subtle border border-border-color font-mono text-xs text-text-primary max-h-[380px] overflow-y-auto whitespace-pre-wrap select-text">
                {material.originalInput.rawContent}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Extracted Content (Sprint 3 & 4: Real Document & OCR results) */}
      {activeTab === "extracted" && (
        <div className="space-y-4">
          {/* Outline / Document Structure (if headings were extracted) */}
          {headings.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Layers size={13} strokeWidth={1.75} />
                Outline ({headings.length})
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-2 bg-bg-subtle rounded-lg border border-border-color">
                {headings.map((h, i) => (
                  <span 
                    key={i} 
                    className="px-2 py-0.5 text-xs bg-bg-surface border border-border-color rounded-md text-text-primary font-medium"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Extraction States: Running | Succeeded / Partial | Not Succeeded */}
          {effectiveStatus === "processing" ? (
            <div className="p-8 rounded-lg bg-bg-subtle border border-border-color text-center space-y-2">
              <div className="inline-flex p-2.5 rounded-full bg-bg-surface border border-border-color text-text-primary">
                <RefreshCw size={18} className="animate-spin" />
              </div>
              <p className="text-xs sm:text-sm font-semibold text-text-primary">{processingMessage}</p>
            </div>
          ) : activeContent ? (
            <div className="space-y-2.5">
              {/* Partial Extraction Indicator */}
              {effectiveStatus === "partially_completed" && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-bg-subtle border border-border-color text-xs text-text-secondary">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <span>{partialMessage}</span>
                  </div>
                  {onReprocess && (
                    <button
                      type="button"
                      onClick={handleReprocessClick}
                      disabled={isReprocessing}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-primary transition-colors cursor-pointer"
                    >
                      <RefreshCw size={10} className={isReprocessing ? "animate-spin" : ""} />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary flex items-center gap-1.5 font-semibold">
                      <AlignLeft size={13} strokeWidth={1.75} />
                      {contentLabel}
                      {onContentChange && (
                        <span className="text-[10px] text-text-muted px-1.5 py-0.2 rounded bg-bg-subtle border border-border-color font-normal">
                          Editable
                        </span>
                      )}
                    </span>

                    {/* Table View Switcher if tables were extracted */}
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
                    type="button"
                    onClick={() => handleCopy(activeContent)}
                    className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer font-medium"
                  >
                    {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                {extractedFormatMode === "table" && extraction?.ocrResult?.tables && extraction.ocrResult.tables.length > 0 ? (
                  <StructuredTableView tables={extraction.ocrResult.tables} />
                ) : onContentChange ? (
                  <textarea
                    id="extracted-content-textarea"
                    value={activeContent}
                    onChange={(e) => onContentChange(e.target.value)}
                    rows={16}
                    className="w-full p-3 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary font-mono leading-relaxed whitespace-pre-wrap select-text focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight resize-y transition-colors"
                    placeholder="Extracted content..."
                  />
                ) : (
                  <div className="p-3 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary font-mono leading-relaxed whitespace-pre-wrap select-text max-h-[480px] overflow-y-auto">
                    {activeContent}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-lg bg-bg-subtle border border-border-color text-center space-y-3">
              <p className="text-xs sm:text-sm font-semibold text-text-primary">{failedMessage}</p>
              {onReprocess && (
                <div>
                  <button
                    type="button"
                    onClick={handleReprocessClick}
                    disabled={isReprocessing}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-border-color bg-bg-surface hover:bg-bg-subtle text-text-primary transition-colors cursor-pointer"
                  >
                    <span>Retry</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
