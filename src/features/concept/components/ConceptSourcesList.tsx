import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page, MediaImage as ImageIcon, MediaVideo, Microphone, Globe, Attachment, ArrowUpRight, NavArrowDown, NavArrowUp, InfoCircle } from "iconoir-react";
import { Material, MaterialType, MaterialExtraction } from "../../../types";

interface ConceptSourcesListProps {
  sourceMaterials: Material[];
  extractions?: Record<string, MaterialExtraction>;
}

export function ConceptSourcesList({
  sourceMaterials,
  extractions = {},
}: ConceptSourcesListProps) {
  const navigate = useNavigate();
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  const getSourceIcon = (type?: MaterialType) => {
    switch (type) {
      case "document":
        return <Page size={16} strokeWidth={1.75} />;
      case "image":
        return <ImageIcon size={16} strokeWidth={1.75} />;
      case "video":
        return <MediaVideo size={16} strokeWidth={1.75} />;
      case "audio":
        return <Microphone size={16} strokeWidth={1.75} />;
      case "link":
        return <Globe size={16} strokeWidth={1.75} />;
      default:
        return <Attachment size={16} strokeWidth={1.75} />;
    }
  };

  const formatPathwayLabel = (pathway?: string) => {
    switch (pathway) {
      case "document_parser":
        return "Document Parser";
      case "ocr":
        return "OCR Text Extraction";
      case "audio_transcription":
        return "Audio Transcription";
      case "video_pipeline":
        return "Video Pipeline";
      case "web_extractor":
        return "Web Content Extractor";
      case "plain_text":
        return "Plain Text Input";
      default:
        return pathway ? pathway.replace("_", " ") : "Direct Intake";
    }
  };

  const formatTime = (isoString?: string) => {
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

  return (
    <div id="concept-sources-card" className="p-4 sm:p-5 rounded-xl bg-bg-surface border border-border-color shadow-2xs space-y-3.5">
      <div className="flex items-center justify-between border-b border-border-color pb-2.5">
        <div className="flex items-center gap-2">
          <Attachment size={15} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Source Materials
          </h2>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-bg-subtle border border-border-color text-text-secondary">
          {sourceMaterials.length} {sourceMaterials.length === 1 ? "source" : "sources"}
        </span>
      </div>

      {sourceMaterials.length === 0 ? (
        <div className="p-4 rounded-lg bg-bg-subtle/40 border border-border-color/60 text-center">
          <p className="text-xs text-text-muted">
            No source materials linked to this concept.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sourceMaterials.map((mat) => {
            const extraction = extractions[mat.id];
            const isExpanded = expandedSourceId === mat.id;

            return (
              <div
                key={mat.id}
                className="p-3 rounded-lg bg-bg-subtle/50 border border-border-color/70 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-md bg-bg-surface border border-border-color text-text-muted shrink-0">
                      {getSourceIcon(mat.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate" title={mat.title}>
                        {mat.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted mt-0.5">
                        <span className="capitalize">{mat.type}</span>
                        <span>•</span>
                        <span>Added {formatTime(mat.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedSourceId(isExpanded ? null : mat.id)}
                      className="p-1 text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
                      title={isExpanded ? "Hide provenance details" : "Show provenance details"}
                      aria-label="Toggle provenance details"
                    >
                      {isExpanded ? <NavArrowUp size={14} /> : <NavArrowDown size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/material/${mat.id}`)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-text-primary border border-border-color transition-colors cursor-pointer"
                      title="Open source in Material Canvas"
                    >
                      <span>Open</span>
                      <ArrowUpRight size={12} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                {/* Provenance traceability disclosure */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2.5 border-t border-border-color/60 text-[11px] text-text-secondary space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 text-text-muted font-medium">
                      <InfoCircle size={12} />
                      <span>Provenance Traceability</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-bg-surface p-2 rounded-md border border-border-color/60 text-[10px]">
                      <div>
                        <span className="text-text-muted block">Intake Type</span>
                        <span className="font-semibold text-text-primary capitalize">
                          {mat.originalInput?.sourceType || "Direct Upload"}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Extraction Method</span>
                        <span className="font-semibold text-text-primary">
                          {formatPathwayLabel(extraction?.pathwayUsed)}
                        </span>
                      </div>
                      {extraction?.completedAt && (
                        <div className="col-span-2">
                          <span className="text-text-muted block">Extracted On</span>
                          <span className="font-semibold text-text-primary">
                            {formatTime(extraction.completedAt)}
                          </span>
                        </div>
                      )}
                    </div>
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
