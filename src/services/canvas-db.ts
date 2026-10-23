import { FlexcilCanvasBoardState, CanvasPaperStyle } from "../types/canvas";

const STORAGE_PREFIX = "alfassa_flexcil_canvas_";

export function getDefaultCanvasState(materialId: string): FlexcilCanvasBoardState {
  return {
    materialId,
    paperStyle: "grid",
    strokes: [],
    notes: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCanvasBoardFromStorage(materialId: string): Promise<FlexcilCanvasBoardState> {
  if (!materialId) return getDefaultCanvasState("default");

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${materialId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultCanvasState(materialId),
        ...parsed,
      };
    }
  } catch (err) {
    console.warn("Failed to load canvas state from localStorage:", err);
  }

  return getDefaultCanvasState(materialId);
}

export async function saveCanvasBoardToStorage(state: FlexcilCanvasBoardState): Promise<void> {
  if (!state || !state.materialId) return;

  try {
    const key = `${STORAGE_PREFIX}${state.materialId}`;
    const serialized = JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(key, serialized);

    // Dispatch custom window event so listeners can update synchronously
    window.dispatchEvent(new CustomEvent("alfassa_canvas_updated", {
      detail: { materialId: state.materialId }
    }));
  } catch (err) {
    console.warn("Failed to save canvas state to localStorage:", err);
  }
}

export async function clearCanvasBoardStorage(materialId: string): Promise<void> {
  if (!materialId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${materialId}`);
    window.dispatchEvent(new CustomEvent("alfassa_canvas_updated", {
      detail: { materialId }
    }));
  } catch (err) {
    console.warn("Failed to clear canvas state:", err);
  }
}
