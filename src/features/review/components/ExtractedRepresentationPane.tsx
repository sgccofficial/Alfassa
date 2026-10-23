import React, { useState } from "react";
import { 
  FileText, 
  Layers, 
  AlignLeft, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Table as TableIcon
} from "lucide-react";
import { MaterialExtraction } from "../../../types";
import { StructuredTableView } from "../../../shared/components/StructuredTableView";

interface ExtractedRepresentationPaneProps {
  extraction: MaterialExtraction | null;
}

function getExtractionTypeLabel(pathwayUsed?: string): string {
  switch (pathwayUsed) {
    case "ocr": return "From image";
    case "audio_transcript": return "From audio";
    case "web_parser": return "From web";
    case "document_parser": return "From document";
    case "multimodal": return "Extracted text";
    default: return "Extracted text";
  }
}

export function ExtractedRepresentationPane({ extraction }: ExtractedRepresentationPaneProps) {
  const [copied, setCopied] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [viewMode, setViewMode] = useState<"text" | "table">("text");

  if (!extraction) {
    return (
      <div className="bg-bg-surface border border-border-color rounded-xl p-4 sm:p-5 space-y-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <FileText size={16} strokeWidth={1.75} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">Extracted Content</h3>
        </div>
        <p className="text-xs text-text-muted">No extracted content available.</p>
      </div>
    );
  }

  const handleCopy = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const headings = extraction.documentStructure?.headings || [];
  const textContent = extraction.extractedText || "";

  return (
    <div className="bg-bg-surface border border-border-color rounded-xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
      {/* Pane Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} strokeWidth={1.75} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">Extracted Content</h3>
        </div>

        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          {getExtractionTypeLabel(extraction.pathwayUsed)}
        </span>
      </div>

      {/* Extracted Headings / Outline */}
      {headings.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
            <Layers size={13} strokeWidth={1.75} />
            Outline ({headings.length})
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto p-2 bg-bg-subtle rounded-lg border border-border-color">
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

      {/* Extracted Body Text / Table View */}
      {textContent && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-text-primary flex items-center gap-1.5 font-semibold">
                <AlignLeft size={13} strokeWidth={1.75} />
                Text
              </span>

              {extraction.ocrResult?.tables && extraction.ocrResult.tables.length > 0 && (
                <div className="inline-flex items-center p-0.5 bg-bg-subtle rounded border border-border-color text-[11px]">
                  <button
                    type="button"
                    onClick={() => setViewMode("text")}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      viewMode === "text"
                        ? "bg-bg-surface text-text-primary font-semibold shadow-2xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      viewMode === "table"
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

            <div className="flex items-center gap-2">
              {viewMode === "text" && (
                <button
                  onClick={() => setShowFullText(!showFullText)}
                  className="text-[11px] text-accent-highlight hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                >
                  {showFullText ? "Collapse" : "Expand"}
                  {showFullText ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
              <button
                onClick={() => handleCopy(textContent)}
                className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 cursor-pointer font-medium"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {viewMode === "table" && extraction.ocrResult?.tables && extraction.ocrResult.tables.length > 0 ? (
            <StructuredTableView tables={extraction.ocrResult.tables} />
          ) : (
            <div className={`p-3 rounded-lg bg-bg-subtle border border-border-color text-xs text-text-primary font-mono leading-relaxed whitespace-pre-wrap select-text overflow-y-auto ${
              showFullText ? "max-h-[360px]" : "max-h-[140px]"
            }`}>
              {textContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
