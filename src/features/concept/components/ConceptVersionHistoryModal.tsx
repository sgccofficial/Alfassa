import React, { useState } from "react";
import { 
  History, 
  X, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  FileText 
} from "lucide-react";
import { ConceptVersion } from "../../../types";

interface ConceptVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: ConceptVersion[];
  currentVersionNumber: number;
}

export function ConceptVersionHistoryModal({
  isOpen,
  onClose,
  versions,
  currentVersionNumber,
}: ConceptVersionHistoryModalProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<ConceptVersion | null>(null);

  if (!isOpen) return null;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "Recorded";
    }
  };

  const handleRestoreVersion = async (version: ConceptVersion) => {
    // This would call a service method to create a NEW version based on the snapshot.
    // For now, I will simulate this or prepare the UI.
    console.log("Restoring version", version.version);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="concept-version-history-dialog"
        className="bg-bg-surface border border-border-color rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-color flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedSnapshot ? (
              <button
                type="button"
                onClick={() => setSelectedSnapshot(null)}
                className="p-1 -ml-1 text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
                title="Back to version list"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <History size={18} strokeWidth={1.75} className="text-text-muted" />
            )}
            <h2 className="text-sm font-bold text-text-primary">
              {selectedSnapshot 
                ? `Version ${selectedSnapshot.version} Snapshot` 
                : "Concept Version History"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-subtle transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {selectedSnapshot ? (
            /* Historical Snapshot Viewer */
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 rounded-lg bg-bg-subtle border border-border-color text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-text-primary">
                    Version {selectedSnapshot.version}
                  </span>
                  <span className="text-text-muted ml-2">
                    {formatDate(selectedSnapshot.createdAt)}
                  </span>
                </div>
                {selectedSnapshot.version === currentVersionNumber && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                    Active Version
                  </span>
                )}
              </div>

              {selectedSnapshot.changeReason && (
                <div className="text-xs text-text-secondary bg-bg-surface p-3 rounded-lg border border-border-color">
                  <span className="font-semibold text-text-primary block mb-0.5">Change Reason</span>
                  {selectedSnapshot.changeReason}
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-text-primary block">Title</span>
                <div className="p-2.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary font-medium">
                  {selectedSnapshot.title}
                </div>
              </div>

              {selectedSnapshot.summary && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-text-primary block">Summary</span>
                  <div className="p-2.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-secondary leading-relaxed">
                    {selectedSnapshot.summary}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-text-primary block">Content</span>
                <div className="p-3.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {selectedSnapshot.content || "(No content)"}
                </div>
              </div>
              
              <div className="pt-4 border-t border-border-color">
                <button
                  type="button"
                  onClick={() => handleRestoreVersion(selectedSnapshot)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
                >
                  <History size={14} />
                  <span>Restore this version (creates new version)</span>
                </button>
              </div>
            </div>
          ) : (
            /* Versions Timeline List */
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                Immutable audit log of all revisions made to this concept. Historical versions remain preserved.
              </p>

              {versions.length === 0 ? (
                <div className="p-6 text-center text-xs text-text-muted rounded-xl bg-bg-subtle/50 border border-border-color">
                  No version history records found.
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((ver) => {
                    const isCurrent = ver.version === currentVersionNumber;

                    return (
                      <div
                        key={ver.id}
                        className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                          isCurrent 
                            ? "bg-bg-surface border-border-color ring-1 ring-border-color" 
                            : "bg-bg-subtle/50 border-border-color/70 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-primary">
                              Version {ver.version}
                            </span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 size={10} />
                                <span>Current</span>
                              </span>
                            )}
                            <span className="text-[11px] text-text-muted">
                              {formatDate(ver.createdAt)}
                            </span>
                          </div>

                          <p className="text-xs text-text-secondary leading-relaxed">
                            {ver.changeReason || "Updated concept knowledge representation."}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedSnapshot(ver)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-text-primary border border-border-color transition-colors shrink-0 cursor-pointer"
                        >
                          View Snapshot
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-color bg-bg-subtle/30 flex items-center justify-between text-xs text-text-muted">
          <span>{versions.length} total {versions.length === 1 ? "revision" : "revisions"}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
