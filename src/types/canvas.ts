export type CanvasTool = 
  | "select"
  | "lasso"
  | "pen" 
  | "fountain_pen"
  | "highlighter" 
  | "laser"
  | "eraser" 
  | "text" 
  | "sticky" 
  | "audio"
  | "shape_line" 
  | "shape_rect" 
  | "shape_circle" 
  | "shape_arrow" 
  | "clip";

export type CanvasPaperStyle = "grid" | "lines" | "dots" | "blank";

export interface CanvasPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface CanvasStroke {
  id: string;
  tool: "pen" | "fountain_pen" | "highlighter" | "laser" | "shape_line" | "shape_rect" | "shape_circle" | "shape_arrow";
  points: CanvasPoint[];
  color: string;
  width: number;
  opacity: number;
  createdAt: string;
}

export interface CanvasNoteItem {
  id: string;
  type: "text" | "sticky" | "clip" | "audio" | "video_embed" | "clock_embed" | "voice_embed";
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  content: string;
  color?: string; // e.g. "#fef9c3", "#e0f2fe", "#dcfce7", "#ffe4e6", "#1e293b"
  embedTheme?: "dark" | "glass" | "light" | "amber" | "indigo" | "emerald" | "crimson";
  videoUrl?: string;
  clockMode?: "clock" | "timer" | "stopwatch";
  timerSeconds?: number;
  timerInitial?: number;
  isTimerRunning?: boolean;
  audioUrl?: string; // Data URL or Object URL for recorded voice notes
  audioDuration?: number; // In seconds
  sourceRef?: {
    materialId?: string;
    sourceTitle?: string;
    pageNumber?: number;
    quoteSnippet?: string;
  };
  createdAt: string;
}

export interface FlexcilCanvasBoardState {
  materialId: string;
  paperStyle: CanvasPaperStyle;
  strokes: CanvasStroke[];
  notes: CanvasNoteItem[];
  zoom: number;
  panX: number;
  panY: number;
  updatedAt: string;
}

