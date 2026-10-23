import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  BookOpen, 
  Search, 
  Paperclip, 
  GitFork, 
  ArrowRight, 
  Layers, 
  CheckSquare, 
  Sparkles,
  Clock
} from "lucide-react";
import { useAuth } from "../../shared/providers/AuthProvider";
import { Concept, Material, KnowledgeRelationship } from "../../types";
import { 
  subscribeToUserConcepts, 
  subscribeToKnowledgeRelationships 
} from "../../services/concept-db";
import { subscribeToUserMaterials } from "../../services/material-db";

export function ConceptsListView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.uid || "guest-user";

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [relationships, setRelationships] = useState<KnowledgeRelationship[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubConcepts = subscribeToUserConcepts(userId, (cList) => {
      setConcepts(cList);
      setIsLoading(false);
    });

    const unsubMaterials = subscribeToUserMaterials(userId, (mList) => {
      setMaterials(mList);
    });

    const unsubRelationships = subscribeToKnowledgeRelationships(userId, (rList) => {
      setRelationships(rList);
    });

    return () => {
      unsubConcepts();
      unsubMaterials();
      unsubRelationships();
    };
  }, [userId]);

  const filteredConcepts = concepts.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.summary && c.summary.toLowerCase().includes(q)) ||
      (c.content && c.content.toLowerCase().includes(q))
    );
  });

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

  return (
    <div id="concepts-directory-view" className="max-w-6xl mx-auto py-4 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-color pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-bg-surface border border-border-color text-text-primary">
              <BookOpen size={18} strokeWidth={1.75} />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
              Knowledge Base
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg-subtle border border-border-color text-text-secondary ml-1">
              {concepts.length} {concepts.length === 1 ? "Concept" : "Concepts"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-muted">
            Accepted knowledge entities in your workspace, derived from reviewed source materials.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search concepts..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-bg-surface border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-highlight focus:ring-1 focus:ring-accent-highlight transition-colors placeholder:text-text-muted"
          />
        </div>
      </div>

      {/* Concepts Grid */}
      {filteredConcepts.length === 0 ? (
        <div className="bg-bg-surface border border-border-color rounded-2xl p-10 text-center max-w-lg mx-auto shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-bg-subtle border border-border-color flex items-center justify-center mx-auto text-text-muted">
            <BookOpen size={24} strokeWidth={1.5} />
          </div>
          <h2 className="text-sm font-bold text-text-primary">
            {searchQuery ? "No matching concepts" : "No accepted concepts yet"}
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            {searchQuery
              ? `No concepts match "${searchQuery}". Try a different keyword.`
              : "When you review uploaded materials in Workspace Review and choose Keep Separate or Merge, accepted knowledge concepts are saved here."}
          </p>
          {!searchQuery && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate("/review")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <CheckSquare size={14} strokeWidth={1.75} />
                <span>Go to Workspace Review</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredConcepts.map((c) => {
            const sourceCount = c.sourceMaterialIds?.length || 0;
            const relCount = relationships.filter(
              (r) => r.sourceConceptId === c.id || r.targetConceptId === c.id
            ).length;

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/concept/${c.id}`)}
                className="bg-bg-surface border border-border-color hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition-all hover:shadow-2xs group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-text-primary line-clamp-1 group-hover:text-text-primary transition-colors">
                      {c.title}
                    </h2>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-bg-subtle border border-border-color text-text-secondary shrink-0">
                      v{c.currentVersion}
                    </span>
                  </div>

                  {c.summary ? (
                    <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">
                      {c.summary}
                    </p>
                  ) : (
                    <p className="text-xs text-text-muted line-clamp-3 font-mono leading-relaxed">
                      {c.content ? c.content.substring(0, 140) + "..." : "No summary provided."}
                    </p>
                  )}
                </div>

                <div className="pt-4 mt-3 border-t border-border-color/60 flex items-center justify-between text-[11px] text-text-muted">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1" title={`${sourceCount} contributing source materials`}>
                      <Paperclip size={12} />
                      <span>{sourceCount}</span>
                    </span>
                    {relCount > 0 && (
                      <span className="inline-flex items-center gap-1" title={`${relCount} knowledge connections`}>
                        <GitFork size={12} />
                        <span>{relCount}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 group-hover:text-text-primary transition-colors">
                    <span>{formatRelativeTime(c.updatedAt)}</span>
                    <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
