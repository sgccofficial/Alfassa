import React, { useState, useEffect, useRef, useCallback, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { EditPencil, Erase, CursorPointer, Text, Post, Circle, Minus, ArrowUpRight, ViewGrid, AlignJustify, Search, ZoomIn, ZoomOut, Undo, Redo, Trash, Download, Scissor, SelectiveTool, Microphone, Play, Pause, BookStack, NavArrowDown, NavArrowUp, Sparks, Xmark, DragHandGesture, Home, ControlSlider, EyeSolid, EyeClosed, Drag, Plus, Settings, MoreHoriz, Bookmark, Page, Ruler, Check, NavArrowRight, ViewColumns2, Copy, Palette, MediaVideo, Clock, Expand, Collapse, LayoutLeft, Square } from "iconoir-react";
import { Material, MaterialExtraction } from "../../types";
import { 
  CanvasTool, 
  CanvasPaperStyle, 
  CanvasPoint, 
  CanvasStroke, 
  CanvasNoteItem 
} from "../../types/canvas";
import { 
  getCanvasBoardFromStorage, 
  saveCanvasBoardToStorage 
} from "../../services/canvas-db";

interface FlexcilCanvasBoardProps {
  material: Material;
  extraction?: MaterialExtraction | null;
  onClipExcerpt?: (text: string) => void;
  className?: string;
  onToggleDocumentDrawer?: () => void;
  onGoHome?: () => void;
  materials?: Material[];
  onSelectMaterial?: (material: Material) => void;
  viewMode?: "canvas" | "file" | "split";
  onViewModeChange?: (mode: "canvas" | "file" | "split") => void;
}

const COLOR_SWATCHES = [
  { name: "Slate", value: "#0f172a" },
  { name: "Crimson", value: "#ef4444" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
];

const STICKY_COLORS = [
  { name: "Yellow", value: "#fef9c3", border: "#fde047", text: "#713f12" },
  { name: "Sky", value: "#e0f2fe", border: "#7dd3fc", text: "#0369a1" },
  { name: "Mint", value: "#dcfce7", border: "#86efac", text: "#15803d" },
  { name: "Rose", value: "#ffe4e6", border: "#f43f5e", text: "#be123c" },
  { name: "Purple", value: "#f3e8ff", border: "#c084fc", text: "#6b21a8" },
  { name: "Dark Slate", value: "#1e293b", border: "#334155", text: "#f8fafc" },
];

const EMBED_THEMES = [
  { id: "dark", label: "Dark Slate", bg: "bg-slate-900", text: "text-white", border: "border-slate-700" },
  { id: "glass", label: "Glassmorphism", bg: "bg-slate-800/80 backdrop-blur-md", text: "text-white", border: "border-slate-600/80" },
  { id: "light", label: "Clean Light", bg: "bg-white", text: "text-slate-900", border: "border-slate-200" },
  { id: "amber", label: "Amber Focus", bg: "bg-amber-950", text: "text-amber-100", border: "border-amber-700" },
  { id: "indigo", label: "Indigo Study", bg: "bg-indigo-950", text: "text-indigo-100", border: "border-indigo-700" },
  { id: "emerald", label: "Emerald Zen", bg: "bg-emerald-950", text: "text-emerald-100", border: "border-emerald-700" },
];

interface ToolCustomItem {
  id: string;
  label: string;
  icon: string;
  isVisible: boolean;
}

const DEFAULT_CUSTOM_TOOLS: ToolCustomItem[] = [
  { id: "pen", label: "Pen", icon: "pencil", isVisible: true },
  { id: "fountain_pen", label: "Fountain / Calligraphy Pen", icon: "sparkles", isVisible: true },
  { id: "highlighter", label: "Highlighter", icon: "highlighter", isVisible: true },
  { id: "eraser", label: "Eraser", icon: "eraser", isVisible: true },
  { id: "tape", label: "Tape", icon: "tape", isVisible: true },
  { id: "shape", label: "Shape", icon: "square", isVisible: true },
  { id: "lasso", label: "Lasso", icon: "lasso", isVisible: true },
  { id: "text", label: "Text / Sticky", icon: "type", isVisible: true },
  { id: "video_embed", label: "Video Embed", icon: "video", isVisible: true },
  { id: "clock_embed", label: "Clock / Timer Embed", icon: "clock", isVisible: true },
  { id: "audio", label: "Audio recording", icon: "mic", isVisible: true },
  { id: "laser", label: "Laser pointer", icon: "laser", isVisible: true },
];

function isPointInPolygon(point: CanvasPoint, polygon: CanvasPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface TempLaserStroke {
  id: string;
  points: CanvasPoint[];
  createdAt: number;
}

export function FlexcilCanvasBoard({
  material,
  extraction,
  className = "",
  onToggleDocumentDrawer,
  onGoHome,
  materials = [],
  onSelectMaterial,
  viewMode = "canvas",
  onViewModeChange
}: FlexcilCanvasBoardProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Tools & Input State
  const [activeTool, setActiveTool] = useState<CanvasTool>("pen");
  const [inputMode, setInputMode] = useState<"pen" | "finger">("finger");
  const [paperStyle, setPaperStyle] = useState<CanvasPaperStyle>("grid");
  
  // Pen Customization
  const [penColor, setPenColor] = useState<string>("#0f172a");
  const [penWidth, setPenWidth] = useState<number>(3);
  const [strokeStyle, setStrokeStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  const [highlighterColor, setHighlighterColor] = useState<string>("#fef08a");
  const [highlighterWidth, setHighlighterWidth] = useState<number>(18);
  
  // Dock & Modal Controls
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [showAllPagesModal, setShowAllPagesModal] = useState<boolean>(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState<boolean>(false);
  const [showOutlineDrawer, setShowOutlineDrawer] = useState<boolean>(false);
  const [showQuickSwitchMenu, setShowQuickSwitchMenu] = useState<boolean>(false);
  const [showFileSwitchMenu, setShowFileSwitchMenu] = useState<boolean>(false);
  const [showMoreOptionsMenu, setShowMoreOptionsMenu] = useState<boolean>(false);
  const [showRuler, setShowRuler] = useState<boolean>(false);
  const [showRecolorPicker, setShowRecolorPicker] = useState<boolean>(false);

  // Tools customization state
  const [customTools, setCustomTools] = useState<ToolCustomItem[]>(DEFAULT_CUSTOM_TOOLS);

  // Stored board state
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [notes, setNotes] = useState<CanvasNoteItem[]>([]);
  const [tapeMasks, setTapeMasks] = useState<
    { id: string; x: number; y: number; width: number; height: number; isRevealed: boolean }[]
  >([]);
  const [undoStack, setUndoStack] = useState<{ strokes: CanvasStroke[]; notes: CanvasNoteItem[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ strokes: CanvasStroke[]; notes: CanvasNoteItem[] }[]>([]);

  // Temporary Laser Pointer Fading Strokes
  const [tempLaserStrokes, setTempLaserStrokes] = useState<TempLaserStroke[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Canvas Pages (Notewise Page Overview)
  const [pages, setPages] = useState<{ id: number; title: string; isBookmarked: boolean }[]>([
    { id: 1, title: "Page 1 - General Notes", isBookmarked: false },
    { id: 2, title: "Page 2 - Concepts & Formulas", isBookmarked: true },
    { id: 3, title: "Page 3 - Summary & Diagrams", isBookmarked: false },
  ]);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interactive Drawing & Lasso Selection
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPoints, setCurrentPoints] = useState<CanvasPoint[]>([]);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tape Drawing State
  const [isDrawingTape, setIsDrawingTape] = useState<boolean>(false);
  const [tempTape, setTempTape] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Lasso selection results
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  // Selected note card for editing
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Note Card Dragging State
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const noteDragStartRef = useRef<{ mouseX: number; mouseY: number; initialNoteX: number; initialNoteY: number } | null>(null);

  // Selection Group Dragging State
  const [isDraggingSelection, setIsDraggingSelection] = useState<boolean>(false);
  const selectionDragRef = useRef<{ mouseX: number; mouseY: number } | null>(null);

  // Clip Excerpt Modal
  const [showClipModal, setShowClipModal] = useState<boolean>(false);
  const [customClipText, setCustomClipText] = useState<string>("");

  // Audio Note Recorder State
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Playing audio card
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Pomodoro Focus Timer tick effect
  useEffect(() => {
    const timer = setInterval(() => {
      setNotes((prevNotes) => {
        let changed = false;
        const updated = prevNotes.map((n) => {
          if (n.type === "clock_embed" && n.clockMode === "timer" && n.isTimerRunning && n.timerSeconds !== undefined) {
            changed = true;
            if (n.timerSeconds > 0) {
              return { ...n, timerSeconds: n.timerSeconds - 1 };
            } else {
              return { ...n, isTimerRunning: false, timerSeconds: 0 };
            }
          }
          if (n.type === "clock_embed" && n.clockMode === "stopwatch" && n.isTimerRunning && n.timerSeconds !== undefined) {
            changed = true;
            return { ...n, timerSeconds: n.timerSeconds + 1 };
          }
          return n;
        });
        return changed ? updated : prevNotes;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Track previous material ID for auto-save before switching
  const prevMaterialIdRef = useRef<string>(material.id);

  // Load state on material change
  useEffect(() => {
    let active = true;

    // Auto-save previous material state if material ID changed
    if (prevMaterialIdRef.current && prevMaterialIdRef.current !== material.id) {
      const state = latestStateRef.current;
      saveCanvasBoardToStorage({
        materialId: prevMaterialIdRef.current,
        paperStyle: state.paperStyle,
        strokes: state.strokes,
        notes: state.notes,
        tapeMasks: state.tapeMasks,
        zoom: state.zoom,
        panX: state.pan.x,
        panY: state.pan.y,
        updatedAt: new Date().toISOString(),
      });
    }

    prevMaterialIdRef.current = material.id;
    setUndoStack([]);
    setRedoStack([]);
    setSelectedStrokeIds([]);
    setSelectedNoteIds([]);

    getCanvasBoardFromStorage(material.id).then((saved) => {
      if (active) {
        if (saved) {
          setPaperStyle(saved.paperStyle || "grid");
          setStrokes(saved.strokes || []);
          setNotes(saved.notes || []);
          setTapeMasks(saved.tapeMasks || []);
          setZoom(saved.zoom || 1);
          setPan({ x: saved.panX || 0, y: saved.panY || 0 });
        } else {
          setPaperStyle("grid");
          setStrokes([]);
          setNotes([]);
          setTapeMasks([]);
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
      }
    });

    return () => {
      active = false;
    };
  }, [material.id]);

  // Synchronous Auto-Save on any exit
  const latestStateRef = useRef({ strokes, notes, tapeMasks, paperStyle, zoom, pan });
  useEffect(() => {
    latestStateRef.current = { strokes, notes, tapeMasks, paperStyle, zoom, pan };
  }, [strokes, notes, tapeMasks, paperStyle, zoom, pan]);

  useEffect(() => {
    const handleExitSave = () => {
      const state = latestStateRef.current;
      if (!material?.id) return;
      saveCanvasBoardToStorage({
        materialId: material.id,
        paperStyle: state.paperStyle,
        strokes: state.strokes,
        notes: state.notes,
        tapeMasks: state.tapeMasks,
        zoom: state.zoom,
        panX: state.pan.x,
        panY: state.pan.y,
        updatedAt: new Date().toISOString(),
      });
    };

    window.addEventListener("beforeunload", handleExitSave);
    window.addEventListener("pagehide", handleExitSave);
    window.addEventListener("unload", handleExitSave);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleExitSave();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      handleExitSave();
      window.removeEventListener("beforeunload", handleExitSave);
      window.removeEventListener("pagehide", handleExitSave);
      window.removeEventListener("unload", handleExitSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [material.id]);

  const saveCurrentState = useCallback(
    (newStrokes: CanvasStroke[], newNotes: CanvasNoteItem[], newTapeMasks?: any[]) => {
      saveCanvasBoardToStorage({
        materialId: material.id,
        paperStyle,
        strokes: newStrokes,
        notes: newNotes,
        tapeMasks: newTapeMasks || tapeMasks,
        zoom,
        panX: pan.x,
        panY: pan.y,
        updatedAt: new Date().toISOString(),
      });
    },
    [material.id, paperStyle, tapeMasks, zoom, pan]
  );

  const pushUndo = useCallback((prevStrokes: CanvasStroke[], prevNotes: CanvasNoteItem[]) => {
    setUndoStack((prev) => [...prev, { strokes: prevStrokes, notes: prevNotes }]);
    setRedoStack([]);
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, { strokes, notes }]);
    setStrokes(last.strokes);
    setNotes(last.notes);
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    saveCurrentState(last.strokes, last.notes);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, { strokes, notes }]);
    setStrokes(next.strokes);
    setNotes(next.notes);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    saveCurrentState(next.strokes, next.notes);
  };

  // Laser Pointer Animation Loop for Temporary Fading
  useEffect(() => {
    if (tempLaserStrokes.length === 0) return;

    const tick = () => {
      const now = Date.now();
      const filtered = tempLaserStrokes.filter((s) => now - s.createdAt < 1500);
      if (filtered.length !== tempLaserStrokes.length) {
        setTempLaserStrokes(filtered);
      }
      if (filtered.length > 0) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [tempLaserStrokes]);

  // Canvas Resize Handler
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. Draw Paper Pattern
    if (paperStyle === "grid") {
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 0.8 / zoom;
      const gridSize = 24;
      for (let x = -width * 2; x < width * 3; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -height * 2);
        ctx.lineTo(x, height * 3);
        ctx.stroke();
      }
      for (let y = -height * 2; y < height * 3; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-width * 2, y);
        ctx.lineTo(width * 3, y);
        ctx.stroke();
      }
    } else if (paperStyle === "lines") {
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1 / zoom;
      const lineGap = 28;
      for (let y = -height * 2; y < height * 3; y += lineGap) {
        ctx.beginPath();
        ctx.moveTo(-width * 2, y);
        ctx.lineTo(width * 3, y);
        ctx.stroke();
      }
    } else if (paperStyle === "dots") {
      ctx.fillStyle = "#94a3b8";
      const dotGap = 24;
      for (let x = -width * 2; x < width * 3; x += dotGap) {
        for (let y = -height * 2; y < height * 3; y += dotGap) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2 / zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 2. Render Stored Drawing Strokes
    strokes.forEach((s) => {
      if (s.points.length === 0) return;

      const isSelected = selectedStrokeIds.includes(s.id);

      ctx.save();

      if (isSelected) {
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = 10 / zoom;
      }

      if (s.tool === "highlighter") {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = "multiply";

        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      } else if (s.tool === "fountain_pen") {
        // Differentiated Calligraphic Nib Ribbon Rendering!
        ctx.fillStyle = s.color;
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = s.opacity || 1.0;
        ctx.globalCompositeOperation = "source-over";

        const angle = Math.PI / 4; // 45-degree calligraphy nib angle
        const nibWidth = s.width * 2.2;
        const nx = Math.cos(angle) * nibWidth;
        const ny = Math.sin(angle) * nibWidth;

        for (let i = 0; i < s.points.length - 1; i++) {
          const p1 = s.points[i];
          const p2 = s.points[i + 1];

          ctx.beginPath();
          ctx.moveTo(p1.x - nx, p1.y - ny);
          ctx.lineTo(p1.x + nx, p1.y + ny);
          ctx.lineTo(p2.x + nx, p2.y + ny);
          ctx.lineTo(p2.x - nx, p2.y - ny);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.globalAlpha = s.opacity || 1.0;
        ctx.globalCompositeOperation = "source-over";

        if (s.tool === "pen") {
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y);
          }
          ctx.stroke();
        } else if (s.tool === "shape_line" && s.points.length >= 2) {
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        } else if (s.tool === "shape_rect" && s.points.length >= 2) {
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (s.tool === "shape_circle" && s.points.length >= 2) {
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          const radius = Math.hypot(end.x - start.x, end.y - start.y);
          ctx.beginPath();
          ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.tool === "shape_arrow" && s.points.length >= 2) {
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          const headAngle = Math.atan2(end.y - start.y, end.x - start.x);
          const headLen = Math.max(12, s.width * 3);
          ctx.beginPath();
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headLen * Math.cos(headAngle - Math.PI / 6), end.y - headLen * Math.sin(headAngle - Math.PI / 6));
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headLen * Math.cos(headAngle + Math.PI / 6), end.y - headLen * Math.sin(headAngle + Math.PI / 6));
          ctx.stroke();
        }
      }

      ctx.restore();
    });

    // 3. Render Temporary Laser Pointer Fading Trails
    tempLaserStrokes.forEach((laser) => {
      const age = Date.now() - laser.createdAt;
      const alpha = Math.max(0, 1 - age / 1500);
      if (alpha <= 0 || laser.points.length === 0) return;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = penWidth * 2.5;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 14 / zoom;

      ctx.beginPath();
      ctx.moveTo(laser.points[0].x, laser.points[0].y);
      for (let i = 1; i < laser.points.length; i++) {
        ctx.lineTo(laser.points[i].x, laser.points[i].y);
      }
      ctx.stroke();

      // Render glowing laser head dot
      const lastPt = laser.points[laser.points.length - 1];
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(lastPt.x, lastPt.y, (penWidth * 1.5) / zoom, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // 4. Render Current Active Drawing Line / Lasso Path
    if (isDrawing && currentPoints.length > 0) {
      ctx.save();

      if (activeTool === "lasso") {
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 1.8 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        if (strokeStyle === "dashed") {
          ctx.setLineDash([8 / zoom, 4 / zoom]);
        } else if (strokeStyle === "dotted") {
          ctx.setLineDash([2 / zoom, 4 / zoom]);
        }

        if (activeTool === "highlighter") {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = highlighterColor;
          ctx.lineWidth = highlighterWidth;
          ctx.globalAlpha = 0.35;
          ctx.globalCompositeOperation = "multiply";

          ctx.beginPath();
          ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
          for (let i = 1; i < currentPoints.length; i++) {
            ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
          }
          ctx.stroke();
        } else if (activeTool === "fountain_pen") {
          ctx.fillStyle = penColor;
          ctx.strokeStyle = penColor;
          ctx.globalAlpha = 1.0;

          const angle = Math.PI / 4;
          const nibWidth = penWidth * 2.2;
          const nx = Math.cos(angle) * nibWidth;
          const ny = Math.sin(angle) * nibWidth;

          for (let i = 0; i < currentPoints.length - 1; i++) {
            const p1 = currentPoints[i];
            const p2 = currentPoints[i + 1];

            ctx.beginPath();
            ctx.moveTo(p1.x - nx, p1.y - ny);
            ctx.lineTo(p1.x + nx, p1.y + ny);
            ctx.lineTo(p2.x + nx, p2.y + ny);
            ctx.lineTo(p2.x - nx, p2.y - ny);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        } else if (activeTool === "laser") {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = penWidth * 2.5;
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 14 / zoom;

          ctx.beginPath();
          ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
          for (let i = 1; i < currentPoints.length; i++) {
            ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
          }
          ctx.stroke();
        } else {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = penColor;
          ctx.lineWidth = penWidth;

          if (activeTool === "pen") {
            ctx.beginPath();
            ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
            for (let i = 1; i < currentPoints.length; i++) {
              ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
            }
            ctx.stroke();
          } else if (activeTool.startsWith("shape_")) {
            const start = currentPoints[0];
            const end = currentPoints[currentPoints.length - 1];
            if (activeTool === "shape_line") {
              ctx.beginPath();
              ctx.moveTo(start.x, start.y);
              ctx.lineTo(end.x, end.y);
              ctx.stroke();
            } else if (activeTool === "shape_rect") {
              ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            } else if (activeTool === "shape_circle") {
              const radius = Math.hypot(end.x - start.x, end.y - start.y);
              ctx.beginPath();
              ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      ctx.restore();
    }

    // 5. Draw Lasso Group Selection Bounding Box & Highlight Outline
    if (selectedStrokeIds.length > 0 || selectedNoteIds.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      strokes.filter((s) => selectedStrokeIds.includes(s.id)).forEach((s) => {
        s.points.forEach((pt) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
      });

      notes.filter((n) => selectedNoteIds.includes(n.id)).forEach((n) => {
        if (n.x < minX) minX = n.x;
        if (n.x + n.width > maxX) maxX = n.x + n.width;
        if (n.y < minY) minY = n.y;
        if (n.y + n.height > maxY) maxY = n.y + n.height;
      });

      if (minX !== Infinity) {
        const pad = 12 / zoom;
        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;

        ctx.save();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Draw selection corner handle dots
        ctx.fillStyle = "#3b82f6";
        const dotR = 4 / zoom;
        [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: minX, y: maxY },
          { x: maxX, y: maxY },
        ].forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.restore();
      }
    }

    // 6. Draw Masking Tape Rectangles
    tapeMasks.forEach((tape) => {
      ctx.save();
      if (!tape.isRevealed) {
        ctx.fillStyle = "#fbbf24";
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 1.5 / zoom;
        ctx.fillRect(tape.x, tape.y, tape.width, tape.height);
        ctx.strokeRect(tape.x, tape.y, tape.width, tape.height);
        
        ctx.fillStyle = "#78350f";
        ctx.font = `${Math.max(10, 12 / zoom)}px sans-serif`;
        ctx.fillText("TAP TO REVEAL", tape.x + 8, tape.y + tape.height / 2 + 4);
      } else {
        ctx.fillStyle = "rgba(251, 191, 36, 0.2)";
        ctx.strokeStyle = "#f59e0b";
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.fillRect(tape.x, tape.y, tape.width, tape.height);
        ctx.strokeRect(tape.x, tape.y, tape.width, tape.height);
      }
      ctx.restore();
    });

    if (isDrawingTape && tempTape) {
      ctx.save();
      ctx.fillStyle = "#fbbf24";
      ctx.globalAlpha = 0.6;
      ctx.fillRect(tempTape.x, tempTape.y, tempTape.width, tempTape.height);
      ctx.restore();
    }

    ctx.restore();
  }, [
    strokes,
    tempLaserStrokes,
    currentPoints,
    isDrawing,
    activeTool,
    penColor,
    penWidth,
    strokeStyle,
    highlighterColor,
    highlighterWidth,
    paperStyle,
    zoom,
    pan,
    selectedStrokeIds,
    selectedNoteIds,
    tapeMasks,
    isDrawingTape,
    tempTape,
  ]);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>): CanvasPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    return {
      x: (rawX - pan.x) / zoom,
      y: (rawY - pan.y) / zoom,
    };
  };

  const eraseNearPoint = (point: CanvasPoint) => {
    const radius = 20 / zoom;
    const updated = strokes.filter(
      (s) => !s.points.some((pt) => Math.hypot(pt.x - point.x, pt.y - point.y) < radius)
    );
    if (updated.length !== strokes.length) {
      pushUndo(strokes, notes);
      setStrokes(updated);
      saveCurrentState(updated, notes);
    }
  };

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    
    const isTouch = e.pointerType === "touch";
    if (inputMode === "pen" && isTouch) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    const coords = getCanvasCoords(e);

    // Check if clicked on a tape mask to toggle reveal
    const clickedTape = tapeMasks.find(
      (t) =>
        coords.x >= t.x &&
        coords.x <= t.x + t.width &&
        coords.y >= t.y &&
        coords.y <= t.y + t.height
    );
    if (clickedTape) {
      setTapeMasks((prev) =>
        prev.map((t) => (t.id === clickedTape.id ? { ...t, isRevealed: !t.isRevealed } : t))
      );
      return;
    }

    if (activeTool === "select") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (activeTool === "eraser") {
      eraseNearPoint(coords);
      setIsDrawing(true);
      return;
    }

    if (activeTool === "tape") {
      setIsDrawingTape(true);
      setTempTape({ x: coords.x, y: coords.y, width: 0, height: 0 });
      return;
    }

    if (activeTool === "text") {
      const newNote: CanvasNoteItem = {
        id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "text",
        x: coords.x,
        y: coords.y,
        width: 240,
        height: 140,
        content: "Type note here...",
        createdAt: new Date().toISOString(),
      };
      pushUndo(strokes, notes);
      const updated = [...notes, newNote];
      setNotes(updated);
      setSelectedNoteId(newNote.id);
      saveCurrentState(strokes, updated);
      setActiveTool("select");
      return;
    }

    if (activeTool === "sticky") {
      const newSticky: CanvasNoteItem = {
        id: `sticky_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "sticky",
        x: coords.x,
        y: coords.y,
        width: 220,
        height: 180,
        title: "Study Note",
        content: "Key observation or note...",
        color: STICKY_COLORS[0].value,
        createdAt: new Date().toISOString(),
      };
      pushUndo(strokes, notes);
      const updated = [...notes, newSticky];
      setNotes(updated);
      setSelectedNoteId(newSticky.id);
      saveCurrentState(strokes, updated);
      setActiveTool("select");
      return;
    }

    if (activeTool === "video_embed" as any) {
      handleAddVideoEmbed(coords.x, coords.y);
      setActiveTool("select");
      return;
    }

    if (activeTool === "clock_embed" as any) {
      handleAddClockEmbed(coords.x, coords.y);
      setActiveTool("select");
      return;
    }

    if (activeTool === "lasso") {
      setSelectedStrokeIds([]);
      setSelectedNoteIds([]);
      setIsDrawing(true);
      setCurrentPoints([coords]);
      return;
    }

    if (activeTool === "laser") {
      setIsDrawing(true);
      setCurrentPoints([coords]);
      return;
    }

    setIsDrawing(true);
    setCurrentPoints([coords]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (isDrawingTape && tempTape) {
      const coords = getCanvasCoords(e);
      setTempTape({
        ...tempTape,
        width: coords.x - tempTape.x,
        height: coords.y - tempTape.y,
      });
      return;
    }

    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    if (activeTool === "eraser") {
      eraseNearPoint(coords);
      return;
    }

    if (activeTool === "laser") {
      setCurrentPoints((prev) => [...prev, coords]);
      return;
    }

    setCurrentPoints((prev) => [...prev, coords]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawingTape && tempTape) {
      const width = Math.abs(tempTape.width);
      const height = Math.abs(tempTape.height);
      if (width > 10 && height > 10) {
        const newTape = {
          id: `tape_${Date.now()}`,
          x: tempTape.width < 0 ? tempTape.x + tempTape.width : tempTape.x,
          y: tempTape.height < 0 ? tempTape.y + tempTape.height : tempTape.y,
          width,
          height,
          isRevealed: false,
        };
        const updated = [...tapeMasks, newTape];
        setTapeMasks(updated);
        saveCurrentState(strokes, notes, updated);
      }
      setIsDrawingTape(false);
      setTempTape(null);
      setActiveTool("select");
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPoints.length > 0) {
      if (activeTool === "lasso") {
        if (currentPoints.length >= 3) {
          const selectedStrokes = strokes.filter((s) =>
            s.points.some((pt) => isPointInPolygon(pt, currentPoints))
          );
          const selectedNoteItems = notes.filter((n) =>
            isPointInPolygon({ x: n.x + n.width / 2, y: n.y + n.height / 2 }, currentPoints)
          );

          setSelectedStrokeIds(selectedStrokes.map((s) => s.id));
          setSelectedNoteIds(selectedNoteItems.map((n) => n.id));
        }
        setCurrentPoints([]);
        return;
      }

      if (activeTool === "laser") {
        // Laser tool creates TEMPORARY fading trails, not permanent ink!
        const newLaser: TempLaserStroke = {
          id: `laser_${Date.now()}`,
          points: currentPoints,
          createdAt: Date.now(),
        };
        setTempLaserStrokes((prev) => [...prev, newLaser]);
        setCurrentPoints([]);
        return;
      }

      if (activeTool !== "eraser" && activeTool !== "tape") {
        const toolType =
          activeTool === "highlighter"
            ? "highlighter"
            : activeTool === "fountain_pen"
            ? "fountain_pen"
            : activeTool.startsWith("shape_")
            ? (activeTool as any)
            : "pen";

        const newStroke: CanvasStroke = {
          id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          tool: toolType,
          points: currentPoints,
          color: activeTool === "highlighter" ? highlighterColor : penColor,
          width: activeTool === "highlighter" ? highlighterWidth : penWidth,
          opacity: activeTool === "highlighter" ? 0.35 : 1.0,
          createdAt: new Date().toISOString(),
        };

        pushUndo(strokes, notes);
        const updated = [...strokes, newStroke];
        setStrokes(updated);
        saveCurrentState(updated, notes);
      }
    }

    setCurrentPoints([]);
  };

  // Sticky Note & Embed Card Dragging Handlers
  const handleStartNoteDrag = (e: React.PointerEvent, noteId: string) => {
    e.stopPropagation();
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    setDraggingNoteId(noteId);
    setSelectedNoteId(noteId);
    noteDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialNoteX: note.x,
      initialNoteY: note.y,
    };

    const handlePointerMoveNote = (moveEvent: PointerEvent) => {
      if (!noteDragStartRef.current) return;
      const dx = (moveEvent.clientX - noteDragStartRef.current.mouseX) / zoom;
      const dy = (moveEvent.clientY - noteDragStartRef.current.mouseY) / zoom;

      setNotes((prevNotes) =>
        prevNotes.map((n) =>
          n.id === noteId
            ? {
                ...n,
                x: noteDragStartRef.current!.initialNoteX + dx,
                y: noteDragStartRef.current!.initialNoteY + dy,
              }
            : n
        )
      );
    };

    const handlePointerUpNote = () => {
      window.removeEventListener("pointermove", handlePointerMoveNote);
      window.removeEventListener("pointerup", handlePointerUpNote);
      setDraggingNoteId(null);
      noteDragStartRef.current = null;
      saveCurrentState(strokes, latestStateRef.current.notes);
    };

    window.addEventListener("pointermove", handlePointerMoveNote);
    window.addEventListener("pointerup", handlePointerUpNote);
  };

  // Selection Group Dragging Handler
  const handleStartSelectionGroupDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDraggingSelection(true);
    selectionDragRef.current = { mouseX: e.clientX, mouseY: e.clientY };

    const handleGroupMove = (moveEvent: PointerEvent) => {
      if (!selectionDragRef.current) return;
      const dx = (moveEvent.clientX - selectionDragRef.current.mouseX) / zoom;
      const dy = (moveEvent.clientY - selectionDragRef.current.mouseY) / zoom;
      selectionDragRef.current = { mouseX: moveEvent.clientX, mouseY: moveEvent.clientY };

      setStrokes((prevStrokes) =>
        prevStrokes.map((s) =>
          selectedStrokeIds.includes(s.id)
            ? {
                ...s,
                points: s.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
              }
            : s
        )
      );

      setNotes((prevNotes) =>
        prevNotes.map((n) =>
          selectedNoteIds.includes(n.id)
            ? { ...n, x: n.x + dx, y: n.y + dy }
            : n
        )
      );
    };

    const handleGroupUp = () => {
      window.removeEventListener("pointermove", handleGroupMove);
      window.removeEventListener("pointerup", handleGroupUp);
      setIsDraggingSelection(false);
      selectionDragRef.current = null;
      saveCurrentState(latestStateRef.current.strokes, latestStateRef.current.notes);
    };

    window.addEventListener("pointermove", handleGroupMove);
    window.addEventListener("pointerup", handleGroupUp);
  };

  // Duplicate Lasso Selection
  const handleDuplicateLassoSelection = () => {
    pushUndo(strokes, notes);
    const newStrokeIds: string[] = [];
    const newNoteIds: string[] = [];

    const duplicatedStrokes: CanvasStroke[] = strokes
      .filter((s) => selectedStrokeIds.includes(s.id))
      .map((s) => {
        const id = `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        newStrokeIds.push(id);
        return {
          ...s,
          id,
          points: s.points.map((pt) => ({ x: pt.x + 25, y: pt.y + 25 })),
        };
      });

    const duplicatedNotes: CanvasNoteItem[] = notes
      .filter((n) => selectedNoteIds.includes(n.id))
      .map((n) => {
        const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        newNoteIds.push(id);
        return {
          ...n,
          id,
          x: n.x + 25,
          y: n.y + 25,
        };
      });

    const updatedStrokes = [...strokes, ...duplicatedStrokes];
    const updatedNotes = [...notes, ...duplicatedNotes];

    setStrokes(updatedStrokes);
    setNotes(updatedNotes);
    setSelectedStrokeIds(newStrokeIds);
    setSelectedNoteIds(newNoteIds);
    saveCurrentState(updatedStrokes, updatedNotes);
  };

  // Recolor Selected Strokes
  const handleRecolorSelectedStrokes = (color: string) => {
    pushUndo(strokes, notes);
    const updatedStrokes = strokes.map((s) =>
      selectedStrokeIds.includes(s.id) ? { ...s, color } : s
    );
    setStrokes(updatedStrokes);
    saveCurrentState(updatedStrokes, notes);
    setShowRecolorPicker(false);
  };

  // Add Video Embed Widget
  const handleAddVideoEmbed = (xCoords?: number, yCoords?: number) => {
    const newVideoEmbed: CanvasNoteItem = {
      id: `embed_video_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: "video_embed",
      x: xCoords !== undefined ? xCoords : 120 - pan.x / zoom,
      y: yCoords !== undefined ? yCoords : 120 - pan.y / zoom,
      width: 380,
      height: 280,
      title: "Educational Video Player",
      content: "Interactive Video Lecture Embed",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      embedTheme: "dark",
      createdAt: new Date().toISOString(),
    };

    pushUndo(strokes, notes);
    const updated = [...notes, newVideoEmbed];
    setNotes(updated);
    saveCurrentState(strokes, updated);
  };

  // Add Clock / Pomodoro Focus Timer Embed Widget
  const handleAddClockEmbed = (xCoords?: number, yCoords?: number) => {
    const newClockEmbed: CanvasNoteItem = {
      id: `embed_clock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: "clock_embed",
      x: xCoords !== undefined ? xCoords : 140 - pan.x / zoom,
      y: yCoords !== undefined ? yCoords : 140 - pan.y / zoom,
      width: 280,
      height: 180,
      title: "Pomodoro Study Clock",
      content: "Focus Timer & Clock",
      clockMode: "timer",
      timerSeconds: 1500, // 25 minutes
      timerInitial: 1500,
      isTimerRunning: false,
      embedTheme: "indigo",
      createdAt: new Date().toISOString(),
    };

    pushUndo(strokes, notes);
    const updated = [...notes, newClockEmbed];
    setNotes(updated);
    saveCurrentState(strokes, updated);
  };

  // Audio Note Recording Logic
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64Url = reader.result as string;
          const newAudioCard: CanvasNoteItem = {
            id: `audio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            type: "audio",
            x: 100 - pan.x / zoom,
            y: 100 - pan.y / zoom,
            width: 260,
            height: 110,
            title: "Voice Note Stamp",
            content: `Recorded voice memo (${recordingTime}s)`,
            audioUrl: base64Url,
            audioDuration: recordingTime,
            createdAt: new Date().toISOString(),
          };

          pushUndo(strokes, notes);
          const updated = [...notes, newAudioCard];
          setNotes(updated);
          saveCurrentState(strokes, updated);
          setRecordingTime(0);
        };
      };

      recorder.start();
      setIsRecordingAudio(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.warn("Could not access microphone for audio note:", err);
      const newAudioCard: CanvasNoteItem = {
        id: `audio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "audio",
        x: 100 - pan.x / zoom,
        y: 100 - pan.y / zoom,
        width: 260,
        height: 110,
        title: "Voice Memo Stamp",
        content: "Audio note attached to material point.",
        audioDuration: 12,
        createdAt: new Date().toISOString(),
      };
      pushUndo(strokes, notes);
      const updated = [...notes, newAudioCard];
      setNotes(updated);
      saveCurrentState(strokes, updated);
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecordingAudio(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const togglePlayAudio = (note: CanvasNoteItem) => {
    if (playingAudioId === note.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingAudioId(null);
      return;
    }

    if (note.audioUrl) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(note.audioUrl);
      audioPlayerRef.current = audio;
      audio.play();
      setPlayingAudioId(note.id);
      audio.onended = () => setPlayingAudioId(null);
    }
  };

  const handleAddClipCard = (textToClip?: string) => {
    const text =
      textToClip ||
      customClipText ||
      extraction?.extractedText?.substring(0, 300) ||
      "Clipped excerpt from " + material.title;
    if (!text.trim()) return;

    const newClip: CanvasNoteItem = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: "clip",
      x: 80 - pan.x / zoom,
      y: 80 - pan.y / zoom,
      width: 280,
      height: 150,
      title: material.title,
      content: text.trim(),
      sourceRef: {
        materialId: material.id,
        sourceTitle: material.title,
        quoteSnippet: text.trim().substring(0, 80) + "...",
      },
      createdAt: new Date().toISOString(),
    };

    pushUndo(strokes, notes);
    const updated = [...notes, newClip];
    setNotes(updated);
    saveCurrentState(strokes, updated);
    setShowClipModal(false);
    setCustomClipText("");
  };

  const handleDeleteNote = (noteId: string) => {
    pushUndo(strokes, notes);
    const updated = notes.filter((n) => n.id !== noteId);
    setNotes(updated);
    setSelectedNoteId(null);
    saveCurrentState(strokes, updated);
  };

  const handleDeleteLassoSelection = () => {
    pushUndo(strokes, notes);
    const updatedStrokes = strokes.filter((s) => !selectedStrokeIds.includes(s.id));
    const updatedNotes = notes.filter((n) => !selectedNoteIds.includes(n.id));
    setStrokes(updatedStrokes);
    setNotes(updatedNotes);
    setSelectedStrokeIds([]);
    setSelectedNoteIds([]);
    saveCurrentState(updatedStrokes, updatedNotes);
  };

  const handleExportAsImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `Notewise-Canvas-${material.title.replace(/\s+/g, "_")}.png`;
    link.href = url;
    link.click();
  };

  // Calculate Selection Bounding Box Overlay position
  let lassoMinX = Infinity, lassoMinY = Infinity, lassoMaxX = -Infinity, lassoMaxY = -Infinity;
  if (selectedStrokeIds.length > 0 || selectedNoteIds.length > 0) {
    strokes.filter((s) => selectedStrokeIds.includes(s.id)).forEach((s) => {
      s.points.forEach((pt) => {
        if (pt.x < lassoMinX) lassoMinX = pt.x;
        if (pt.x > lassoMaxX) lassoMaxX = pt.x;
        if (pt.y < lassoMinY) lassoMinY = pt.y;
        if (pt.y > lassoMaxY) lassoMaxY = pt.y;
      });
    });

    notes.filter((n) => selectedNoteIds.includes(n.id)).forEach((n) => {
      if (n.x < lassoMinX) lassoMinX = n.x;
      if (n.x + n.width > lassoMaxX) lassoMaxX = n.x + n.width;
      if (n.y < lassoMinY) lassoMinY = n.y;
      if (n.y + n.height > lassoMaxY) lassoMaxY = n.y + n.height;
    });
  }

  return (
    <div className={`flex flex-col bg-slate-100 dark:bg-slate-900 overflow-hidden relative w-full h-full select-none ${className}`}>
      
      {/* ================= NOTEWISE TOP FLOATING PILL HEADERS ================= */}
      <div className="absolute top-2 left-2 right-2 z-30 flex items-start justify-between pointer-events-none">
        
        {/* Left Floating Pill Capsules Group */}
        <div className="flex flex-col gap-1.5 pointer-events-auto">
          {/* Top Pill Capsule 1 */}
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 rounded-full px-2 py-1 shadow-md flex items-center gap-1">
            {/* Home button */}
            <button
              type="button"
              onClick={onGoHome || (() => navigate("/"))}
              className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Go to Home / Materials"
            >
              <Home size={15} />
            </button>

            {/* All Pages Thumbnail Grid button */}
            <button
              type="button"
              onClick={() => setShowAllPagesModal(true)}
              className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="All Pages Overview"
            >
              <ViewGrid size={15} />
            </button>

            {/* View Mode Switcher Pill (File Reader | Canvas | Split View) */}
            {onViewModeChange && (
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700/80 p-0.5 rounded-full">
                <button
                  type="button"
                  onClick={() => onViewModeChange("file")}
                  className={`h-5 px-2 rounded-full text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    viewMode === "file" ? "bg-blue-600 text-white shadow-2xs" : "text-slate-600 dark:text-slate-300"
                  }`}
                  title="View Original Source File"
                >
                  <BookStack size={10} />
                  <span>File</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange("canvas")}
                  className={`h-5 px-2 rounded-full text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    viewMode === "canvas" ? "bg-blue-600 text-white shadow-2xs" : "text-slate-600 dark:text-slate-300"
                  }`}
                  title="View Infinite Canvas Board"
                >
                  <LayoutLeft size={10} />
                  <span>Canvas</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange("split")}
                  className={`h-5 px-2 rounded-full text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    viewMode === "split" ? "bg-blue-600 text-white shadow-2xs" : "text-slate-600 dark:text-slate-300"
                  }`}
                  title="Side-by-Side Split View"
                >
                  <ViewColumns2 size={10} />
                  <span>Split</span>
                </button>
              </div>
            )}

            {/* Current File / Canvas Switcher Pill */}
            {materials.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFileSwitchMenu(!showFileSwitchMenu)}
                  className="h-6 px-2 rounded-full bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer max-w-[150px]"
                  title="Switch Canvas File"
                >
                  <span className="truncate">{material.title}</span>
                  <NavArrowDown size={12} className="shrink-0 text-slate-400" />
                </button>

                {showFileSwitchMenu && (
                  <div className="absolute top-full left-0 mt-1.5 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 text-xs">
                    <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-700 mb-1">
                      Toggle Canvas File
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
                      {materials.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            if (onSelectMaterial) onSelectMaterial(m);
                            setShowFileSwitchMenu(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                            m.id === material.id
                              ? "bg-blue-600 text-white font-semibold shadow-2xs"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span className="truncate pr-2">{m.title}</span>
                          {m.id === "standalone-scratchpad" ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold uppercase shrink-0">Scratchpad</span>
                          ) : (
                            <span className="text-[9px] opacity-70 uppercase font-mono shrink-0">{m.type}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Switch Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowQuickSwitchMenu(!showQuickSwitchMenu)}
                className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-0.5"
                title="Quick Switch Menu"
              >
                <div className="flex flex-col -space-y-1">
                  <NavArrowUp size={10} />
                  <NavArrowDown size={10} />
                </div>
              </button>

              {showQuickSwitchMenu && (
                <div className="absolute top-full left-0 mt-1.5 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickSwitchMenu(false);
                      setShowClipModal(true);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Scissor size={13} className="text-blue-500" />
                    <span>Insert Excerpt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickSwitchMenu(false);
                      handleAddVideoEmbed();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <MediaVideo size={13} className="text-purple-500" />
                    <span>Video Player Embed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickSwitchMenu(false);
                      handleAddClockEmbed();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Clock size={13} className="text-amber-500" />
                    <span>Clock / Pomodoro Timer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickSwitchMenu(false);
                      setShowOutlineDrawer(true);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Search size={13} className="text-emerald-500" />
                    <span>Search & Outline</span>
                  </button>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                  <div className="px-2.5 py-0.5 text-[9px] uppercase font-bold text-slate-400">Paper Grid</div>
                  <button
                    type="button"
                    onClick={() => { setPaperStyle("grid"); setShowQuickSwitchMenu(false); }}
                    className={`w-full text-left px-2.5 py-1 flex items-center gap-2 ${paperStyle === "grid" ? "font-bold text-blue-600" : "text-slate-600 dark:text-slate-300"}`}
                  >
                    <ViewGrid size={12} />
                    <span>Grid Pattern</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaperStyle("lines"); setShowQuickSwitchMenu(false); }}
                    className={`w-full text-left px-2.5 py-1 flex items-center gap-2 ${paperStyle === "lines" ? "font-bold text-blue-600" : "text-slate-600 dark:text-slate-300"}`}
                  >
                    <AlignJustify size={12} />
                    <span>Ruled Lines</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaperStyle("dots"); setShowQuickSwitchMenu(false); }}
                    className={`w-full text-left px-2.5 py-1 flex items-center gap-2 ${paperStyle === "dots" ? "font-bold text-blue-600" : "text-slate-600 dark:text-slate-300"}`}
                  >
                    <Search size={12} />
                    <span>Dot Pattern</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Pill Capsule 2 (Undo / Redo / Stylus Finger Toggle) */}
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 rounded-full px-2 py-1 shadow-md flex items-center gap-1 w-fit">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors cursor-pointer"
              title="Undo"
            >
              <Undo size={15} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors cursor-pointer"
              title="Redo"
            >
              <Redo size={15} />
            </button>

            <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {/* Input Mode Toggle: Stylus Pen vs Finger Touch */}
            <button
              type="button"
              onClick={() => setInputMode((prev) => (prev === "pen" ? "finger" : "pen"))}
              className={`p-1 px-2 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                inputMode === "pen"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
              }`}
              title={inputMode === "pen" ? "Pen Mode Active (Touch pans canvas)" : "Finger Mode Active (Touch draws)"}
            >
              {inputMode === "pen" ? <EditPencil size={12} /> : <DragHandGesture size={12} />}
              <span className="text-[10px] font-mono uppercase">{inputMode}</span>
            </button>
          </div>
        </div>

        {/* Right Floating Pill Capsule */}
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 rounded-full px-2 py-1 shadow-md flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            className="p-1 rounded-full text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            title="Pen Edit Active"
          >
            <EditPencil size={15} />
          </button>

          <button
            type="button"
            className="p-1 rounded-full text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="AI Sparkles"
          >
            <Sparks size={15} />
          </button>

          {onToggleDocumentDrawer && (
            <button
              type="button"
              onClick={onToggleDocumentDrawer}
              className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Toggle Original Document Drawer"
            >
              <BookStack size={15} />
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreOptionsMenu(!showMoreOptionsMenu)}
              className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="More Options"
            >
              <MoreHoriz size={15} />
            </button>

            {showMoreOptionsMenu && (
              <div className="absolute top-full right-0 mt-1.5 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => { setShowOutlineDrawer(true); setShowMoreOptionsMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Page size={13} />
                  <span>Document Outline</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleExportAsImage(); setShowMoreOptionsMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Download size={13} />
                  <span>Export Canvas PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustomizeModal(true); setShowMoreOptionsMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <ControlSlider size={13} />
                  <span>Customize Dock Tools</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= MAIN INTERACTIVE CANVAS ================= */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full relative overflow-hidden bg-white dark:bg-slate-950 cursor-crosshair select-none"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute inset-0 w-full h-full block touch-none cursor-crosshair"
        />

        {/* Floating Ruler Tool Overlay */}
        {showRuler && (
          <div className="absolute top-1/3 left-1/4 z-20 w-80 h-14 bg-amber-100/90 dark:bg-amber-950/80 border-2 border-amber-500 rounded-lg shadow-xl backdrop-blur-xs flex items-center justify-between px-3 cursor-grab active:cursor-grabbing">
            <span className="text-[10px] font-mono font-bold text-amber-900 dark:text-amber-200">
              RULER GUIDE - 0cm ....... 5cm ....... 10cm ....... 15cm
            </span>
            <button
              type="button"
              onClick={() => setShowRuler(false)}
              className="p-1 rounded hover:bg-amber-200 text-amber-900 dark:text-amber-200"
            >
              <Xmark size={14} />
            </button>
          </div>
        )}

        {/* Floating Lasso Selection Context Menu Bar */}
        {(selectedStrokeIds.length > 0 || selectedNoteIds.length > 0) && lassoMinX !== Infinity && (
          <div
            className="absolute z-40 pointer-events-auto flex items-center gap-1 bg-slate-900/95 dark:bg-slate-800/95 text-white p-1 rounded-xl shadow-2xl border border-slate-700/80 backdrop-blur-md animate-fade-in"
            style={{
              left: `${pan.x + lassoMinX * zoom}px`,
              top: `${Math.max(10, pan.y + (lassoMinY - 45) * zoom)}px`,
              transform: "translateY(-100%)",
            }}
          >
            {/* Drag Group Handle */}
            <button
              type="button"
              onPointerDown={handleStartSelectionGroupDrag}
              className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-grab active:cursor-grabbing"
              title="Drag Selection Group"
            >
              <Drag size={13} />
              <span>Move</span>
            </button>

            {/* Duplicate Selection */}
            <button
              type="button"
              onClick={handleDuplicateLassoSelection}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Duplicate Selection"
            >
              <Copy size={14} />
            </button>

            {/* Recolor Strokes Button */}
            {selectedStrokeIds.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRecolorPicker(!showRecolorPicker)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
                  title="Change Stroke Color"
                >
                  <Palette size={14} />
                </button>

                {showRecolorPicker && (
                  <div className="absolute top-full left-0 mt-1 p-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl flex items-center gap-1.5 z-50">
                    {COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.name}
                        type="button"
                        onClick={() => handleRecolorSelectedStrokes(swatch.value)}
                        className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform cursor-pointer"
                        style={{ backgroundColor: swatch.value }}
                        title={swatch.name}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Delete Selection */}
            <button
              type="button"
              onClick={handleDeleteLassoSelection}
              className="p-1.5 rounded-lg hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
              title="Delete Selection"
            >
              <Trash size={14} />
            </button>

            <div className="w-px h-4 bg-slate-700 mx-0.5" />

            <button
              type="button"
              onClick={() => {
                setSelectedStrokeIds([]);
                setSelectedNoteIds([]);
              }}
              className="p-1 rounded text-slate-400 hover:text-white"
              title="Deselect"
            >
              <Xmark size={13} />
            </button>
          </div>
        )}

        {/* Note Cards, Embed Widgets & Voice Memo Stamps Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {notes.map((note) => {
            const isLassoSelected = selectedNoteIds.includes(note.id);
            const isDragging = draggingNoteId === note.id;

            // Video Embed Widget Rendering
            if (note.type === "video_embed") {
              const theme = EMBED_THEMES.find((t) => t.id === (note.embedTheme || "dark")) || EMBED_THEMES[0];

              return (
                <div
                  key={note.id}
                  style={{
                    position: "absolute",
                    left: `${note.x}px`,
                    top: `${note.y}px`,
                    width: `${note.width}px`,
                  }}
                  className={`pointer-events-auto rounded-2xl border shadow-xl flex flex-col overflow-hidden transition-all group ${
                    theme.bg
                  } ${theme.border} ${theme.text} ${
                    isLassoSelected ? "ring-2 ring-blue-500" : isDragging ? "ring-2 ring-purple-500 shadow-2xl" : ""
                  }`}
                >
                  {/* Header Bar with Drag Handle */}
                  <div
                    onPointerDown={(e) => handleStartNoteDrag(e, note.id)}
                    className="px-3 py-2 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing bg-black/20"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Drag size={14} className="opacity-60" />
                      <MediaVideo size={14} className="text-purple-400 shrink-0" />
                      <span className="text-xs font-bold truncate">{note.title || "Video Study Player"}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Theme Switcher Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextIdx = (EMBED_THEMES.findIndex((t) => t.id === note.embedTheme) + 1) % EMBED_THEMES.length;
                          const nextTheme = EMBED_THEMES[nextIdx].id as any;
                          const updated = notes.map((n) => (n.id === note.id ? { ...n, embedTheme: nextTheme } : n));
                          setNotes(updated);
                          saveCurrentState(strokes, updated);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-xs font-mono opacity-80"
                        title="Change Design Theme"
                      >
                        <Palette size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                        className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                        title="Remove Video"
                      >
                        <Xmark size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Video Embed Frame */}
                  <div className="relative w-full aspect-video bg-black/80">
                    <iframe
                      src={note.videoUrl || "https://www.youtube.com/embed/dQw4w9WgXcQ"}
                      title="Study Video"
                      className="w-full h-full border-none"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>

                  {/* URL Input Bar */}
                  <div className="p-2 border-t border-white/10 bg-black/30 flex items-center gap-1.5 text-xs">
                    <input
                      type="text"
                      value={note.videoUrl || ""}
                      onChange={(e) => {
                        const url = e.target.value;
                        const updated = notes.map((n) => (n.id === note.id ? { ...n, videoUrl: url } : n));
                        setNotes(updated);
                        saveCurrentState(strokes, updated);
                      }}
                      placeholder="Paste YouTube embed URL..."
                      className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-[11px] focus:outline-none font-mono"
                    />
                  </div>
                </div>
              );
            }

            // Clock / Pomodoro Focus Timer Embed Widget
            if (note.type === "clock_embed") {
              const theme = EMBED_THEMES.find((t) => t.id === (note.embedTheme || "indigo")) || EMBED_THEMES[4];
              const mode = note.clockMode || "timer";
              const timerSec = note.timerSeconds ?? 1500;
              const mins = Math.floor(timerSec / 60);
              const secs = timerSec % 60;
              const formattedTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

              return (
                <div
                  key={note.id}
                  style={{
                    position: "absolute",
                    left: `${note.x}px`,
                    top: `${note.y}px`,
                    width: `${note.width}px`,
                  }}
                  className={`pointer-events-auto rounded-2xl border shadow-xl flex flex-col overflow-hidden transition-all group ${
                    theme.bg
                  } ${theme.border} ${theme.text} ${
                    isLassoSelected ? "ring-2 ring-blue-500" : isDragging ? "ring-2 ring-amber-500 shadow-2xl" : ""
                  }`}
                >
                  {/* Header Bar */}
                  <div
                    onPointerDown={(e) => handleStartNoteDrag(e, note.id)}
                    className="px-3 py-2 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing bg-black/20"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Drag size={14} className="opacity-60" />
                      <Clock size={14} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-bold truncate">{note.title || "Pomodoro Clock"}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextIdx = (EMBED_THEMES.findIndex((t) => t.id === note.embedTheme) + 1) % EMBED_THEMES.length;
                          const nextTheme = EMBED_THEMES[nextIdx].id as any;
                          const updated = notes.map((n) => (n.id === note.id ? { ...n, embedTheme: nextTheme } : n));
                          setNotes(updated);
                          saveCurrentState(strokes, updated);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-xs opacity-80"
                        title="Change Design Theme"
                      >
                        <Palette size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                        className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                        title="Remove Clock"
                      >
                        <Xmark size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Clock Mode Switcher */}
                  <div className="p-2 border-b border-white/10 flex items-center justify-center gap-1 text-[10px] font-bold uppercase bg-black/10">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = notes.map((n) => (n.id === note.id ? { ...n, clockMode: "timer" as any } : n));
                        setNotes(updated);
                        saveCurrentState(strokes, updated);
                      }}
                      className={`px-2 py-0.5 rounded transition-colors ${mode === "timer" ? "bg-amber-500 text-slate-950 font-extrabold" : "opacity-60"}`}
                    >
                      Pomodoro 25m
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = notes.map((n) => (n.id === note.id ? { ...n, clockMode: "stopwatch" as any, timerSeconds: 0 } : n));
                        setNotes(updated);
                        saveCurrentState(strokes, updated);
                      }}
                      className={`px-2 py-0.5 rounded transition-colors ${mode === "stopwatch" ? "bg-amber-500 text-slate-950 font-extrabold" : "opacity-60"}`}
                    >
                      Stopwatch
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = notes.map((n) => (n.id === note.id ? { ...n, clockMode: "clock" as any } : n));
                        setNotes(updated);
                        saveCurrentState(strokes, updated);
                      }}
                      className={`px-2 py-0.5 rounded transition-colors ${mode === "clock" ? "bg-amber-500 text-slate-950 font-extrabold" : "opacity-60"}`}
                    >
                      Live Clock
                    </button>
                  </div>

                  {/* Display Section */}
                  <div className="p-4 flex flex-col items-center justify-center gap-2">
                    {mode === "clock" ? (
                      <div className="text-2xl font-mono font-bold tracking-widest text-amber-400">
                        {new Date().toLocaleTimeString()}
                      </div>
                    ) : (
                      <>
                        <div className="text-3xl font-mono font-extrabold tracking-widest text-amber-300 drop-shadow-md">
                          {formattedTime}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = notes.map((n) => (n.id === note.id ? { ...n, isTimerRunning: !n.isTimerRunning } : n));
                              setNotes(updated);
                              saveCurrentState(strokes, updated);
                            }}
                            className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1 hover:bg-amber-400 transition-colors shadow-xs"
                          >
                            {note.isTimerRunning ? <Pause size={12} /> : <Play size={12} />}
                            <span>{note.isTimerRunning ? "Pause" : "Start"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = notes.map((n) =>
                                n.id === note.id
                                  ? {
                                      ...n,
                                      isTimerRunning: false,
                                      timerSeconds: mode === "timer" ? 1500 : 0,
                                    }
                                  : n
                              );
                              setNotes(updated);
                              saveCurrentState(strokes, updated);
                            }}
                            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs transition-colors"
                            title="Reset Timer"
                          >
                            <Undo size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            }

            // Standard Sticky Note & Text Cards Rendering
            return (
              <div
                key={note.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNoteId(note.id);
                }}
                style={{
                  position: "absolute",
                  left: `${note.x}px`,
                  top: `${note.y}px`,
                  width: `${note.width}px`,
                  backgroundColor:
                    note.type === "sticky"
                      ? note.color || "#fef9c3"
                      : note.type === "audio"
                      ? "#fff7ed"
                      : "#ffffff",
                }}
                className={`pointer-events-auto p-3 rounded-2xl border shadow-lg transition-all group flex flex-col gap-2 ${
                  note.type === "sticky"
                    ? "border-amber-300 text-slate-900"
                    : note.type === "audio"
                    ? "border-amber-400 text-slate-900"
                    : note.type === "clip"
                    ? "bg-white dark:bg-slate-900 border-blue-400 text-slate-900 dark:text-slate-100"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                } ${
                  isLassoSelected
                    ? "ring-2 ring-blue-500 shadow-xl"
                    : isDragging
                    ? "ring-2 ring-amber-500 shadow-2xl scale-102"
                    : selectedNoteId === note.id
                    ? "ring-2 ring-slate-900 dark:ring-slate-100 shadow-lg"
                    : ""
                }`}
              >
                {/* Drag Header Bar */}
                <div
                  onPointerDown={(e) => handleStartNoteDrag(e, note.id)}
                  className="flex items-center justify-between gap-2 border-b border-black/10 dark:border-white/10 pb-1.5 cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Drag size={13} className="opacity-40" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-black/70 dark:text-white/70 truncate flex items-center gap-1">
                      {note.type === "sticky" && <Post size={12} />}
                      {note.type === "clip" && <Scissor size={12} className="text-blue-500" />}
                      {note.type === "text" && <Text size={12} />}
                      {note.type === "audio" && <Microphone size={12} className="text-rose-600" />}
                      {note.title || (note.type === "audio" ? "Voice Stamp" : "Sticky Note")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                    {/* Note Color Picker for Sticky Notes */}
                    {note.type === "sticky" && (
                      <div className="flex items-center gap-0.5">
                        {STICKY_COLORS.slice(0, 4).map((sc) => (
                          <button
                            key={sc.name}
                            type="button"
                            onClick={() => {
                              const updated = notes.map((n) => (n.id === note.id ? { ...n, color: sc.value } : n));
                              setNotes(updated);
                              saveCurrentState(strokes, updated);
                            }}
                            className="w-3 h-3 rounded-full border border-black/20 hover:scale-125 transition-transform cursor-pointer"
                            style={{ backgroundColor: sc.value }}
                            title={sc.name}
                          />
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded text-black/40 hover:text-red-600 transition-colors cursor-pointer"
                      title="Delete Note"
                    >
                      <Xmark size={12} />
                    </button>
                  </div>
                </div>

                {note.type === "audio" ? (
                  <div className="flex items-center justify-between gap-2 py-1 bg-amber-100/80 p-2 rounded-xl border border-amber-300">
                    <button
                      type="button"
                      onClick={() => togglePlayAudio(note)}
                      className="p-2 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer shadow-xs"
                    >
                      {playingAudioId === note.id ? <Pause size={14} /> : <Play size={14} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{note.content}</p>
                      <span className="text-[10px] font-mono text-slate-500">
                        {note.audioDuration ? `${note.audioDuration}s` : "Voice Note"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={note.content}
                    onChange={(e) => {
                      const text = e.target.value;
                      const updated = notes.map((n) => (n.id === note.id ? { ...n, content: text } : n));
                      setNotes(updated);
                      saveCurrentState(strokes, updated);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    rows={3}
                    className="w-full bg-transparent text-xs font-sans leading-relaxed focus:outline-none resize-y placeholder:text-black/40"
                    placeholder="Type note or excerpt..."
                  />
                )}

                {note.sourceRef && (
                  <div className="text-[10px] font-mono text-slate-400 border-t border-black/10 pt-1 truncate">
                    Ref: {note.sourceRef.sourceTitle}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= NOTEWISE DUAL-TIER FLOATING BOTTOM DOCK ================= */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 max-w-[98%] pointer-events-auto">
        
        {!isDockCollapsed && (
          /* Upper Tier: Stroke Styles & Color Swatches Bar */
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in flex-wrap justify-center">
            
            {/* Line style selector (Solid, Dashed, Dotted) */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700/60 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setStrokeStyle("solid")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  strokeStyle === "solid" ? "bg-white dark:bg-slate-600 text-blue-600 shadow-2xs" : "text-slate-500"
                }`}
                title="Solid Stroke"
              >
                —
              </button>
              <button
                type="button"
                onClick={() => setStrokeStyle("dashed")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  strokeStyle === "dashed" ? "bg-white dark:bg-slate-600 text-blue-600 shadow-2xs" : "text-slate-500"
                }`}
                title="Dashed Stroke"
              >
                - -
              </button>
              <button
                type="button"
                onClick={() => setStrokeStyle("dotted")}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  strokeStyle === "dotted" ? "bg-white dark:bg-slate-600 text-blue-600 shadow-2xs" : "text-slate-500"
                }`}
                title="Dotted Stroke"
              >
                . .
              </button>
            </div>

            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

            {/* Stroke Thickness Indicator & Slider */}
            <div className="flex items-center gap-1.5">
              <div
                className="rounded-full bg-slate-900 dark:bg-slate-100 transition-all"
                style={{ width: `${Math.max(3, penWidth * 1.5)}px`, height: `${Math.max(3, penWidth * 1.5)}px` }}
              />
              <input
                type="range"
                min="1"
                max="14"
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
                className="w-12 h-1 accent-blue-600 cursor-pointer"
                title="Stroke Weight"
              />
            </div>

            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

            {/* Signature Color Swatch Circles */}
            <div className="flex items-center gap-1">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.name}
                  type="button"
                  onClick={() => setPenColor(swatch.value)}
                  className={`w-4 h-4 rounded-full transition-transform cursor-pointer border border-white dark:border-slate-800 shadow-2xs ${
                    penColor === swatch.value ? "ring-2 ring-blue-500 ring-offset-1 scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: swatch.value }}
                  title={swatch.name}
                />
              ))}

              {/* Add Custom Color Button */}
              <input
                type="color"
                value={penColor}
                onChange={(e) => setPenColor(e.target.value)}
                className="w-4 h-4 rounded-full border-0 p-0 cursor-pointer overflow-hidden opacity-80 hover:opacity-100"
                title="Pick Custom Color"
              />
            </div>
          </div>
        )}

        {/* Lower Tier: Main Tool Picker Dock */}
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-700/90 px-2 py-1 rounded-xl shadow-xl flex items-center gap-1 flex-wrap justify-center">
          
          {/* Pan Hand Tool */}
          <button
            type="button"
            onClick={() => setActiveTool("select")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "select"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Pan / Select"
          >
            <CursorPointer size={14} />
          </button>

          {/* Standard Pen */}
          <button
            type="button"
            onClick={() => setActiveTool("pen")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "pen"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Standard Round Pen"
          >
            <EditPencil size={14} />
          </button>

          {/* Fountain / Calligraphy Pen */}
          <button
            type="button"
            onClick={() => setActiveTool("fountain_pen")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "fountain_pen"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Fountain / Calligraphy Ribbon Pen"
          >
            <Sparks size={14} />
          </button>

          {/* Highlighter */}
          <button
            type="button"
            onClick={() => setActiveTool("highlighter")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "highlighter"
                ? "bg-amber-400 text-slate-900 font-bold shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Highlighter"
          >
            <EditPencil size={14} />
          </button>

          {/* Eraser */}
          <button
            type="button"
            onClick={() => setActiveTool("eraser")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "eraser"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Stroke Eraser"
          >
            <Erase size={14} />
          </button>

          {/* Masking Tape */}
          <button
            type="button"
            onClick={() => setActiveTool("tape")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "tape"
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Study Masking Tape (Click to draw tape overlay)"
          >
            <Bookmark size={14} />
          </button>

          {/* Shape Tool */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool.startsWith("shape_") ? "pen" : "shape_rect")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool.startsWith("shape_")
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Geometric Shapes"
          >
            <Square size={14} />
          </button>

          {/* Lasso Tool */}
          <button
            type="button"
            onClick={() => setActiveTool("lasso")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "lasso"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Lasso Selection"
          >
            <SelectiveTool size={14} />
          </button>

          {/* Text / Sticky Note Tool */}
          <button
            type="button"
            onClick={() => setActiveTool("sticky")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "sticky" || activeTool === "text"
                ? "bg-amber-300 text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Text & Sticky Note Card"
          >
            <Post size={14} />
          </button>

          {/* Video Embed Tool Button */}
          <button
            type="button"
            onClick={() => handleAddVideoEmbed()}
            className="p-1.5 rounded-lg text-xs font-semibold text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer"
            title="Embed Video Player"
          >
            <MediaVideo size={14} />
          </button>

          {/* Clock / Focus Timer Embed Tool Button */}
          <button
            type="button"
            onClick={() => handleAddClockEmbed()}
            className="p-1.5 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
            title="Embed Clock / Pomodoro Focus Timer"
          >
            <Clock size={14} />
          </button>

          {/* Ruler Guide Toggle */}
          <button
            type="button"
            onClick={() => setShowRuler(!showRuler)}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              showRuler
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Toggle Ruler Guide"
          >
            <Ruler size={14} />
          </button>

          {/* Voice Microphone Recorder */}
          {!isRecordingAudio ? (
            <button
              type="button"
              onClick={startAudioRecording}
              className="p-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Record Voice Stamp"
            >
              <Microphone size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={stopAudioRecording}
              className="p-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white animate-pulse transition-all cursor-pointer flex items-center gap-1"
              title="Stop Recording"
            >
              <Square size={13} />
              <span className="font-mono text-[9px]">{recordingTime}s</span>
            </button>
          )}

          {/* Laser Pointer */}
          <button
            type="button"
            onClick={() => setActiveTool("laser")}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTool === "laser"
                ? "bg-red-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Temporary Fading Laser Pointer"
          >
            <CursorPointer size={14} />
          </button>

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Gear / Customize Toolbar Sheet Button */}
          <button
            type="button"
            onClick={() => setShowCustomizeModal(true)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Customize Dock Tools"
          >
            <ControlSlider size={14} />
          </button>

          {/* Collapse Dock Arrow Toggle */}
          <button
            type="button"
            onClick={() => setIsDockCollapsed(!isDockCollapsed)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title={isDockCollapsed ? "Expand Toolbar" : "Collapse Toolbar"}
          >
            {isDockCollapsed ? <NavArrowUp size={14} /> : <NavArrowDown size={14} />}
          </button>
        </div>
      </div>

      {/* ================= MODAL: ALL PAGES THUMBNAIL GRID ================= */}
      {showAllPagesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-3xl max-h-[85vh] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ViewGrid size={20} className="text-blue-500" />
                <span>All Pages Overview</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAllPagesModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Xmark size={20} />
              </button>
            </div>

            {/* Thumbnail Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-2">
              {pages.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setCurrentPage(p.id);
                    setShowAllPagesModal(false);
                  }}
                  className={`border-2 rounded-2xl p-3 flex flex-col gap-2 cursor-pointer transition-all hover:scale-102 ${
                    currentPage === p.id
                      ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 shadow-md"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-slate-300"
                  }`}
                >
                  <div className="w-full h-32 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-2 relative overflow-hidden flex items-center justify-center">
                    <ViewGrid size={24} className="text-slate-200 dark:text-slate-800" />
                    <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded">
                      P.{p.id}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <span className="truncate">{p.title}</span>
                    {p.isBookmarked && <Bookmark size={14} className="text-amber-500 fill-amber-500" />}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const newId = pages.length + 1;
                  setPages([...pages, { id: newId, title: `Page ${newId} - Extra Notes`, isBookmarked: false }]);
                }}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-colors cursor-pointer min-h-[160px]"
              >
                <Plus size={28} />
                <span className="text-xs font-bold">Add Page</span>
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
              <span className="text-xs text-slate-500">Total {pages.length} Pages</span>
              <button
                type="button"
                onClick={() => setShowAllPagesModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CUSTOMIZE TOOLBAR SHEET ================= */}
      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 border-t sm:border border-slate-200 dark:border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ControlSlider size={18} className="text-blue-500" />
                <span>Reorder Tools & Visibility</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <Xmark size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {customTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60"
                >
                  <div className="flex items-center gap-3">
                    <Drag size={16} className="text-slate-400 cursor-grab" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{tool.label}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomTools(
                        customTools.map((t) => (t.id === tool.id ? { ...t, isVisible: !t.isVisible } : t))
                      );
                    }}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      tool.isVisible ? "text-blue-600 bg-blue-50 dark:bg-blue-950/40" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {tool.isVisible ? <EyeSolid size={16} /> : <EyeClosed size={16} />}
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCustomizeModal(false)}
              className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Save Custom Layout
            </button>
          </div>
        </div>
      )}

      {/* ================= DRAWER: DOCUMENT OUTLINE ================= */}
      {showOutlineDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 h-full border-l border-slate-200 dark:border-slate-700 shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Page size={18} className="text-blue-500" />
                <span>Document Outline</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowOutlineDrawer(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <Xmark size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search outline or notes..."
                className="w-full pl-8 pr-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-600">Chapter 1</span>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{material.title}</p>
                <p className="text-[11px] text-slate-500 line-clamp-2">Key concepts and summary breakdown</p>
              </div>

              {extraction?.extractedText && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Extracted Text Sample</span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-4 leading-relaxed">
                    {extraction.extractedText}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CLIP EXCERPT ================= */}
      {showClipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Scissor size={16} className="text-blue-500" />
                <span>Clip Excerpt to Canvas Board</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowClipModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <Xmark size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Paste or type text from "{material.title}" to pin as a clip card on your canvas board.
            </p>

            <textarea
              value={customClipText}
              onChange={(e) => setCustomClipText(e.target.value)}
              rows={5}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 font-sans leading-relaxed resize-y"
              placeholder={extraction?.extractedText?.substring(0, 200) || "Paste document excerpt quote here..."}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClipModal(false)}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddClipCard()}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-opacity cursor-pointer shadow-2xs"
              >
                Pin Excerpt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
