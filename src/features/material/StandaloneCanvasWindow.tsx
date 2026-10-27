import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, BookStack, OpenInWindow, ViewColumns2, Expand, Sparks, Xmark, EyeSolid, EyeClosed } from "iconoir-react";
import { Loading } from "loading-dev";
import { Material, MaterialExtraction } from "../../types";
import { useAuth } from "../../shared/providers/AuthProvider";
import { getMaterialFromDb, subscribeToUserMaterials } from "../../services/material-db";
import { subscribeToExtraction } from "../../services/extraction-db";
import { FlexcilCanvasBoard } from "./FlexcilCanvasBoard";
import { SourceMaterialPane } from "../review/components/SourceMaterialPane";

export function StandaloneCanvasWindow() {
  const { id: materialId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.uid || "guest-user";

  const [material, setMaterial] = useState<Material | null>(null);
  const [extraction, setExtraction] = useState<MaterialExtraction | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // File Drawer Visibility State (Allows user to toggle the original file anytime)
  const [showFileDrawer, setShowFileDrawer] = useState<boolean>(true);
  const [drawerWidthPercent, setDrawerWidthPercent] = useState<number>(40); // 40% width in split view

  // Load material & extraction
  useEffect(() => {
    if (!materialId) return;
    let isMounted = true;
    setIsLoading(true);

    getMaterialFromDb(materialId, currentUserId).then((mat) => {
      if (isMounted) {
        if (mat) setMaterial(mat);
        setIsLoading(false);
      }
    });

    const unsubMat = subscribeToUserMaterials(currentUserId, (list) => {
      const found = list.find((m) => m.id === materialId);
      if (found && isMounted) {
        setMaterial(found);
        setIsLoading(false);
      }
    });

    const unsubExt = subscribeToExtraction(materialId, currentUserId, (ext) => {
      if (isMounted) setExtraction(ext);
    });

    return () => {
      isMounted = false;
      unsubMat();
      unsubExt();
    };
  }, [materialId, currentUserId]);

  if (isLoading && !material) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-text-secondary">
          <Loading  size={24} />
          <p className="text-xs font-semibold">Opening Infinite Canvas Board...</p>
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-base font-bold text-text-primary mb-2">Material Not Found</h2>
        <p className="text-xs text-text-secondary mb-4">Could not load material for the canvas board.</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
        >
          Return to Materials
        </button>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-bg-main flex flex-col relative select-none">
      {/* Top Floating Control Bar */}
      <header className="h-12 bg-bg-surface/95 backdrop-blur-md border-b border-border-color px-4 flex items-center justify-between gap-4 shrink-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/material/${material.id}`)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Return to Material Details"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-4 w-px bg-border-color" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-text-primary truncate max-w-[200px] sm:max-w-xs">
              {material.title}
            </span>
            <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-bg-subtle text-text-muted">
              Infinite Canvas
            </span>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2">
          {/* Toggle Original File Drawer Button */}
          <button
            type="button"
            onClick={() => setShowFileDrawer((prev) => !prev)}
            className={`h-8 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              showFileDrawer
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs"
                : "bg-bg-surface border border-border-color text-text-secondary hover:text-text-primary hover:bg-bg-subtle"
            }`}
            title="Toggle Original Source Document Overlay/Drawer"
          >
            <BookStack size={14} />
            <span>{showFileDrawer ? "Hide File" : "Original File"}</span>
          </button>

          {/* Open Pop-out Window button */}
          <button
            type="button"
            onClick={() => {
              window.open(
                `/canvas/${material.id}`,
                `CanvasWindow_${material.id}`,
                "width=1280,height=850,resizable=yes,scrollbars=no,status=no"
              );
            }}
            className="h-8 px-3 rounded-xl text-xs font-semibold bg-bg-surface border border-border-color text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer inline-flex items-center gap-1.5"
            title="Open Canvas in Separate Window"
          >
            <OpenInWindow size={14} />
            <span className="hidden sm:inline">Pop Out Window</span>
          </button>
        </div>
      </header>

      {/* Main Board Container */}
      <div className="flex-1 w-full h-[calc(100vh-48px)] flex relative overflow-hidden">
        {/* Left Drawer / Side Pane for Original Source Material */}
        {showFileDrawer && (
          <div 
            className="h-full border-r border-border-color bg-bg-surface flex flex-col shrink-0 relative transition-all duration-200 z-20 shadow-lg"
            style={{ width: `${drawerWidthPercent}%`, minWidth: "320px", maxWidth: "600px" }}
          >
            <div className="p-2 border-b border-border-color bg-bg-subtle/80 flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 px-2">
                <BookStack size={14} className="text-text-muted" />
                <span>Original File View</span>
              </span>
              <button
                type="button"
                onClick={() => setShowFileDrawer(false)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-surface cursor-pointer"
                title="Close Original File Drawer"
              >
                <Xmark size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <SourceMaterialPane
                material={material}
                extraction={extraction}
                editableContent={extraction?.extractedText || material.originalInput?.rawContent || ""}
              />
            </div>
          </div>
        )}

        {/* Main Infinite Canvas Board */}
        <div className="flex-1 h-full relative overflow-hidden bg-bg-surface">
          <FlexcilCanvasBoard
            material={material}
            extraction={extraction}
            className="w-full h-full rounded-none border-none shadow-none"
          />
        </div>
      </div>
    </div>
  );
}
