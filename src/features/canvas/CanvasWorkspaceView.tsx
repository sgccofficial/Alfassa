import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { EditPencil, BookStack, ViewColumns2, NavArrowDown, Page, Plus, Search, Sparks, OpenInWindow, Xmark, LayoutLeft } from "iconoir-react";
import { Loading } from "loading-dev";
import { Material, MaterialExtraction } from "../../types";
import { useAuth } from "../../shared/providers/AuthProvider";
import { getMaterialFromDb, subscribeToUserMaterials } from "../../services/material-db";
import { subscribeToExtraction } from "../../services/extraction-db";
import { FlexcilCanvasBoard } from "../material/FlexcilCanvasBoard";
import { SourceMaterialPane } from "../review/components/SourceMaterialPane";

const DEFAULT_SCRATCHPAD: Material = {
  id: "standalone-scratchpad",
  userId: "guest-user",
  workspaceId: "default-workspace",
  title: "Main Canvas Scratchpad",
  type: "text",
  status: "intake_completed",
  pipeline: {
    stage: "ready_for_review",
    reviewPending: false,
  },
  originalInput: {
    sourceType: "paste",
    rawContent: "Main standalone canvas scratchpad for quick notes, sketches, and drawings."
  },
  metadata: {
    origin: "canvas-app"
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function CanvasWorkspaceView() {
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.uid || "guest-user";

  const activeMaterialId = routeId || searchParams.get("id");

  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<Material>(DEFAULT_SCRATCHPAD);
  const [extraction, setExtraction] = useState<MaterialExtraction | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Layout & View Switcher State: "canvas" | "file" | "split"
  const [viewMode, setViewMode] = useState<"canvas" | "file" | "split">("canvas");
  const [showSourcePane, setShowSourcePane] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // All available canvas options: Main Scratchpad + uploaded user study materials
  const allAvailableMaterials = [DEFAULT_SCRATCHPAD, ...materials];

  // Subscribe to user materials list
  useEffect(() => {
    let isMounted = true;
    const unsubMat = subscribeToUserMaterials(currentUserId, (list) => {
      if (!isMounted) return;
      setMaterials(list);
      
      if (activeMaterialId) {
        if (activeMaterialId === DEFAULT_SCRATCHPAD.id) {
          setSelectedMaterial(DEFAULT_SCRATCHPAD);
        } else {
          const found = list.find((m) => m.id === activeMaterialId);
          if (found) setSelectedMaterial(found);
        }
      } else {
        setSelectedMaterial(DEFAULT_SCRATCHPAD);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubMat();
    };
  }, [currentUserId, activeMaterialId]);

  // Load specific material details if activeMaterialId changes
  useEffect(() => {
    if (!activeMaterialId) {
      setSelectedMaterial(DEFAULT_SCRATCHPAD);
      return;
    }
    if (activeMaterialId === DEFAULT_SCRATCHPAD.id) {
      setSelectedMaterial(DEFAULT_SCRATCHPAD);
      return;
    }

    let isMounted = true;

    getMaterialFromDb(activeMaterialId, currentUserId).then((mat) => {
      if (isMounted && mat) {
        setSelectedMaterial(mat);
      }
    });
  }, [activeMaterialId, currentUserId]);

  // Subscribe to material extraction whenever selectedMaterial changes
  useEffect(() => {
    if (!selectedMaterial?.id || selectedMaterial.id === DEFAULT_SCRATCHPAD.id) {
      setExtraction(null);
      return;
    }

    let isMounted = true;
    const unsubExt = subscribeToExtraction(selectedMaterial.id, currentUserId, (ext) => {
      if (isMounted) {
        setExtraction(ext);
      }
    });

    return () => {
      isMounted = false;
      unsubExt();
    };
  }, [selectedMaterial?.id, currentUserId]);

  const handleSelectMaterial = (mat: Material) => {
    setSelectedMaterial(mat);
    if (mat.id === DEFAULT_SCRATCHPAD.id) {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ id: mat.id }, { replace: true });
    }
    setIsDropdownOpen(false);
  };

  const filteredMaterials = allAvailableMaterials.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="canvas-workspace-page" className="relative w-screen h-screen overflow-hidden bg-slate-900 text-slate-100 select-none flex flex-col">
      
      {/* ================= TOP APPLICATION BAR WITH VIEW MODE SWITCHER ================= */}
      <div className="h-11 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 flex items-center justify-between z-40 shrink-0">
        
        {/* Left: App Title & File Switcher Dropdown */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Return to Home"
          >
            <EditPencil size={16} className="text-blue-500" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="h-7 px-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer max-w-[220px]"
            >
              <Page size={13} className="text-blue-400 shrink-0" />
              <span className="truncate text-slate-200">{selectedMaterial.title}</span>
              <NavArrowDown size={12} className="text-slate-400 shrink-0" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs">
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search materials..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredMaterials.map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => handleSelectMaterial(mat)}
                      className={`w-full text-left p-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                        selectedMaterial.id === mat.id
                          ? "bg-blue-600 text-white font-semibold"
                          : "text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      <span className="truncate pr-2">{mat.title}</span>
                      {mat.id === "standalone-scratchpad" ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase shrink-0">Scratchpad</span>
                      ) : (
                        <span className="text-[9px] opacity-70 uppercase font-mono shrink-0">
                          {mat.type}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: View Switcher Mode Tabs (File Reader | Canvas | Split View) */}
        <div className="flex items-center gap-1 bg-slate-800/90 p-0.5 rounded-xl border border-slate-700/80 shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode("file")}
            className={`h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === "file"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            }`}
            title="Original File Reader View"
          >
            <BookStack size={13} />
            <span className="hidden sm:inline">File Reader</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("canvas")}
            className={`h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === "canvas"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            }`}
            title="Infinite Canvas Board"
          >
            <LayoutLeft size={13} />
            <span className="hidden sm:inline">Infinite Canvas</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === "split"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            }`}
            title="Side-by-Side Split View"
          >
            <ViewColumns2 size={13} />
            <span className="hidden sm:inline">Split View</span>
          </button>
        </div>

        {/* Right: Quick Home Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Exit Workspace</span>
          </button>
        </div>
      </div>

      {/* ================= MAIN VIEWPORT CONTAINER ================= */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex">
        {isLoading ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loading  size={24} />
              <p className="text-xs font-semibold">Opening Workspace...</p>
            </div>
          </div>
        ) : (
          <>
            {/* 1. File Reader View (When viewMode === "file" or "split") */}
            {(viewMode === "file" || viewMode === "split") && (
              <div
                className={`h-full bg-slate-900 border-r border-slate-800 overflow-y-auto flex flex-col ${
                  viewMode === "split" ? "w-1/2" : "w-full"
                }`}
              >
                <div className="p-4 flex-1">
                  <SourceMaterialPane
                    material={selectedMaterial}
                    extraction={extraction}
                    editableContent={extraction?.extractedText || selectedMaterial.originalInput?.rawContent || ""}
                  />
                </div>
              </div>
            )}

            {/* 2. Infinite Canvas Board (When viewMode === "canvas" or "split") */}
            {(viewMode === "canvas" || viewMode === "split") && (
              <div
                className={`h-full relative overflow-hidden flex-1 ${
                  viewMode === "split" ? "w-1/2" : "w-full"
                }`}
              >
                <FlexcilCanvasBoard
                  material={selectedMaterial}
                  extraction={extraction}
                  materials={allAvailableMaterials}
                  onSelectMaterial={handleSelectMaterial}
                  className="w-full h-full border-none rounded-none shadow-none"
                  onToggleDocumentDrawer={() => setShowSourcePane((prev) => !prev)}
                  onGoHome={() => navigate("/")}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
