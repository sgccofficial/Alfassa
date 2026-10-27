import React, { useEffect, useRef, useState } from "react";
import { Page, ZoomIn, ZoomOut, Expand, Refresh, WarningCircle, Download } from "iconoir-react";
import { Loading } from "loading-dev";
import { Material } from "../../types";
import { 
  loadOriginalMaterial, 
  normalizeBlobMimeType 
} from "../../services/material-file-loader";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

// Polyfills for modern ECMAScript methods required by pdfjs-dist v6
if (typeof Promise !== "undefined" && typeof (Promise as any).try !== "function") {
  (Promise as any).try = function <T>(fn: (...args: any[]) => T | PromiseLike<T>, ...args: any[]): Promise<T> {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (typeof Promise !== "undefined" && typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof Map !== "undefined" && typeof (Map.prototype as any).getOrInsertComputed !== "function") {
  (Map.prototype as any).getOrInsertComputed = function <K, V>(key: K, compute: (key: K) => V): V {
    if (this.has(key)) {
      return this.get(key);
    }
    const value = compute(key);
    this.set(key, value);
    return value;
  };
}

if (typeof Uint8Array !== "undefined" && typeof (Uint8Array.prototype as any).toHex !== "function") {
  (Uint8Array.prototype as any).toHex = function (): string {
    return Array.from(this as Uint8Array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };
}

// Configure PDF.js worker
if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    // Optional asynchronous background in-thread fallback loader
    import("pdfjs-dist/build/pdf.worker.mjs")
      .then((w) => {
        (globalThis as any).pdfjsWorker = w;
      })
      .catch(() => {});
  } catch (e) {
    console.warn("[OriginalPdfViewer] Could not set workerSrc:", e);
  }
}

interface OriginalPdfViewerProps {
  material: Material;
  blob?: Blob | null;
  mediaSource?: string | null;
  onOpenCanvas?: () => void;
  onOpenInCanvas?: () => void;
  sampleText?: string;
}

export function OriginalPdfViewer({
  material,
  blob: initialBlob,
  mediaSource: initialMediaSource,
  onOpenCanvas,
  onOpenInCanvas,
}: OriginalPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [renderMode, setRenderMode] = useState<"pdfjs" | "native">("pdfjs");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(1.15);
  const [resolvedBlobUrl, setResolvedBlobUrl] = useState<string | null>(initialMediaSource || null);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  const localBlobUrlRef = useRef<string | null>(null);
  const activeLoadingTaskRef = useRef<any>(null);

  const materialId = material.id;
  const fileName = material.originalInput?.fileName || material.title;

  // Single stable loading effect per materialId (Requirement 1, 4, 5, 8, 10)
  useEffect(() => {
    let isCancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    // Cancel any previous PDF.js loading task
    if (activeLoadingTaskRef.current) {
      try {
        activeLoadingTaskRef.current.destroy();
      } catch {}
      activeLoadingTaskRef.current = null;
    }

    // Strict 6-second bounded timeout (Requirement 8)
    const overallTimeoutTimer = setTimeout(() => {
      if (!isCancelled) {
        console.warn(`[OriginalPdfViewer] Timeout loading PDF for material ${materialId}`);
        setErrorMessage("Unable to load this file.");
        setStatus("error");
      }
    }, 6000);

    const loadPdf = async () => {
      let activeBlob: Blob | null = initialBlob || null;
      let effectiveBlobUrl: string | null = initialMediaSource || null;

      try {
        // 1. Retrieve original binary bytes if not already provided
        if (!activeBlob || activeBlob.size === 0) {
          try {
            const retrieved = await loadOriginalMaterial(material);
            if (isCancelled) {
              URL.revokeObjectURL(retrieved.objectUrl);
              return;
            }
            activeBlob = retrieved.blob;
            effectiveBlobUrl = retrieved.objectUrl;
            localBlobUrlRef.current = retrieved.objectUrl;
          } catch (retrErr: any) {
            console.warn("[OriginalPdfViewer] Binary retrieval error:", retrErr);
          }
        }

        // 2. Validate and normalize PDF MIME type
        if (activeBlob && activeBlob.size > 0) {
          activeBlob = normalizeBlobMimeType(activeBlob, "application/pdf");
          if (!effectiveBlobUrl) {
            effectiveBlobUrl = URL.createObjectURL(activeBlob);
            localBlobUrlRef.current = effectiveBlobUrl;
          }
        }

        if (isCancelled) return;
        setResolvedBlobUrl(effectiveBlobUrl);

        if (!activeBlob || activeBlob.size === 0) {
          throw new Error("Unable to load this file.");
        }

        // GUARD FOR LARGE PDFs (>15MB): Native browser iframe viewer streams pages without allocating heavy HTML Canvas elements
        if (activeBlob.size > 15 * 1024 * 1024 && effectiveBlobUrl) {
          console.info(`[OriginalPdfViewer] PDF size (${(activeBlob.size / 1024 / 1024).toFixed(1)}MB) > 15MB: using native browser viewer`);
          setRenderMode("native");
          setStatus("loaded");
          clearTimeout(overallTimeoutTimer);
          return;
        }

        const arrayBuffer = await activeBlob.arrayBuffer();
        if (isCancelled) return;

        // 3. Render using PDF.js with graceful fallback to native browser PDF iframe
        try {
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          }

          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
          });
          activeLoadingTaskRef.current = loadingTask;

          const loadedPdf = await loadingTask.promise;
          if (isCancelled) return;

          setPdfDocument(loadedPdf);
          setNumPages(loadedPdf.numPages);

          // GUARD FOR MANY-PAGE PDFs (>12 pages): Native browser viewer streams pages on demand without canvas memory blowout
          if (loadedPdf.numPages > 12 && effectiveBlobUrl) {
            console.info(`[OriginalPdfViewer] PDF has ${loadedPdf.numPages} pages (>12): using native browser viewer`);
            setRenderMode("native");
            setStatus("loaded");
            clearTimeout(overallTimeoutTimer);
            return;
          }

          setRenderedPages(Array.from({ length: loadedPdf.numPages }, (_, i) => i + 1));
          setRenderMode("pdfjs");
          setStatus("loaded");
          clearTimeout(overallTimeoutTimer);
        } catch (pdfjsErr: any) {
          if (isCancelled) return;
          console.warn("[OriginalPdfViewer] PDF.js rendering failed, attempting native browser fallback:", pdfjsErr);
          const fallbackUrl = effectiveBlobUrl || (activeBlob ? URL.createObjectURL(activeBlob) : null);
          if (fallbackUrl) {
            if (!effectiveBlobUrl) {
              localBlobUrlRef.current = fallbackUrl;
              setResolvedBlobUrl(fallbackUrl);
            }
            setRenderMode("native");
            setStatus("loaded");
            clearTimeout(overallTimeoutTimer);
          } else {
            throw pdfjsErr;
          }
        }
      } catch (err: any) {
        if (isCancelled) return;
        console.error("[OriginalPdfViewer] PDF parsing/loading failed:", err);
        const fallbackUrl = effectiveBlobUrl || (activeBlob ? URL.createObjectURL(activeBlob) : null);
        if (fallbackUrl) {
          console.warn("[OriginalPdfViewer] Recovering with native browser PDF viewer");
          if (!effectiveBlobUrl) {
            localBlobUrlRef.current = fallbackUrl;
            setResolvedBlobUrl(fallbackUrl);
          }
          setRenderMode("native");
          setStatus("loaded");
          clearTimeout(overallTimeoutTimer);
          return;
        }
        setErrorMessage("Unable to load this file.");
        setStatus("error");
        clearTimeout(overallTimeoutTimer);
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
      clearTimeout(overallTimeoutTimer);
      if (activeLoadingTaskRef.current) {
        try {
          activeLoadingTaskRef.current.destroy();
        } catch {}
        activeLoadingTaskRef.current = null;
      }
    };
  }, [materialId, retryTrigger]);

  // Clean up any locally created object URLs on unmount
  useEffect(() => {
    return () => {
      if (localBlobUrlRef.current) {
        URL.revokeObjectURL(localBlobUrlRef.current);
        localBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleRetry = () => {
    setRetryTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-2 select-none flex flex-col">
      {/* Viewer Toolbar: Clean, simple zoom controls for canvas view */}
      {status === "loaded" && (
        <div className="flex items-center justify-between px-1 text-xs">
          {resolvedBlobUrl && (
            <button
              type="button"
              onClick={() => setRenderMode((m) => (m === "pdfjs" ? "native" : "pdfjs"))}
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-bg-subtle hover:bg-bg-surface border border-border-color text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              {renderMode === "pdfjs" ? "Switch to Native Viewer" : "Switch to Canvas Viewer"}
            </button>
          )}
          {renderMode === "pdfjs" && numPages > 0 && (
            <div className="inline-flex items-center p-0.5 rounded-lg bg-bg-subtle border border-border-color ml-auto">
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.max(0.7, prev - 0.15))}
                className="p-1 hover:bg-bg-surface rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <span className="px-1.5 text-[10px] font-mono text-text-secondary min-w-[36px] text-center">
                {Math.round((zoomScale / 1.15) * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.min(2.0, prev + 0.15))}
                className="p-1 hover:bg-bg-surface rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(1.15)}
                className="p-1 hover:bg-bg-surface rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Fit Width"
                aria-label="Fit Width"
              >
                <Expand size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main PDF Viewing Container */}
      <div 
        ref={containerRef}
        className="rounded-xl border border-border-color bg-slate-100 dark:bg-slate-900/50 min-h-[460px] overflow-hidden relative flex flex-col"
      >
        {/* State 1: Loading (Strictly bounded, never infinite) */}
        {status === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3 text-center min-h-[420px]">
            <Loading size={24} className="text-text-secondary" />
            <p className="text-xs text-text-secondary font-medium">
              Loading original PDF document…
            </p>
          </div>
        )}

        {/* State 2: Error (Clear, actionable, never silent white box) */}
        {status === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3 text-center min-h-[420px] max-w-md mx-auto">
            <div className="p-2.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <WarningCircle size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-text-primary">
                Unable to load this file.
              </h4>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleRetry}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-bg-surface border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Refresh size={13} />
                <span>Retry</span>
              </button>
              {resolvedBlobUrl && (
                <a
                  href={resolvedBlobUrl}
                  download={fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download size={13} />
                  <span>Download file</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* State 3: High-Fidelity Vertically Scrollable Multi-Page Canvas Viewer OR Native PDF Viewer */}
        {status === "loaded" && (
          renderMode === "pdfjs" && numPages > 0 ? (
            <div 
              id="pdf-pages-scroll-container"
              className="overflow-y-auto max-h-[72vh] min-h-[480px] p-4 sm:p-6 space-y-6 flex flex-col items-center"
            >
              {renderedPages.map((pageNum) => (
                <PdfCanvasPage
                  key={`${materialId}-page-${pageNum}-${zoomScale}`}
                  pageNumber={pageNum}
                  pdfDocument={pdfDocument}
                  zoomScale={zoomScale}
                  onRenderError={() => {
                    console.warn("[OriginalPdfViewer] Page canvas render failed, switching to native PDF viewer");
                    setRenderMode("native");
                  }}
                />
              ))}
            </div>
          ) : resolvedBlobUrl ? (
            <div className="w-full h-[72vh] min-h-[480px] flex flex-col">
              <iframe
                src={`${resolvedBlobUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full min-h-[480px] border-0 rounded-xl"
                title={fileName}
              />
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

interface PdfCanvasPageProps {
  key?: string;
  pageNumber: number;
  pdfDocument: any;
  zoomScale: number;
  onRenderError?: (error: any) => void;
}

/**
 * Individual Page Canvas Container:
 * Renders the exact vector and embedded typography page layout from PDF.js.
 * Automatically cancels active tasks properly when zooming to prevent race conditions or blank pages.
 */
function PdfCanvasPage({
  pageNumber,
  pdfDocument,
  zoomScale,
  onRenderError,
}: PdfCanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const activeTaskRef = useRef<any>(null);

  useEffect(() => {
    let isCancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !pdfDocument) return;

    if (activeTaskRef.current) {
      try {
        activeTaskRef.current.cancel();
      } catch {}
      activeTaskRef.current = null;
    }

    pdfDocument.getPage(pageNumber).then((page: any) => {
      if (isCancelled) return;

      const container = canvas.closest("#pdf-pages-scroll-container");
      const containerWidth = container ? container.clientWidth : 650;
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const availableWidth = Math.max(280, (containerWidth || 650) - 48);
      const fitScale = availableWidth / unscaledViewport.width;
      const finalScale = Math.max(0.4, fitScale * (zoomScale / 1.15));
      const viewport = page.getViewport({ scale: finalScale });

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderTask = page.render({
        canvasContext: ctx,
        canvas: canvas,
        viewport: viewport,
      });

      activeTaskRef.current = renderTask;

      renderTask.promise
        .then(() => {
          if (!isCancelled) {
            setRendered(true);
            activeTaskRef.current = null;
          }
        })
        .catch((err: any) => {
          if (err?.name === "RenderingCancelledException") {
            return;
          }
          console.warn(`[PDF Page ${pageNumber} render error]:`, err);
          if (onRenderError && !isCancelled) {
            onRenderError(err);
          }
        });
    }).catch((pageErr: any) => {
      if (!isCancelled) {
        console.warn(`[PDF getPage ${pageNumber} error]:`, pageErr);
        if (onRenderError) {
          onRenderError(pageErr);
        }
      }
    });

    return () => {
      isCancelled = true;
      if (activeTaskRef.current) {
        try {
          activeTaskRef.current.cancel();
        } catch {}
        activeTaskRef.current = null;
      }
    };
  }, [pageNumber, pdfDocument, zoomScale]);

  return (
    <div className="flex flex-col items-center group">
      {/* Paper Sheet Elevation */}
      <div className="bg-white rounded-sm shadow-md border border-slate-200/90 dark:border-slate-800 overflow-hidden relative min-h-[200px]">
        <canvas
          ref={canvasRef}
          className={`block transition-opacity duration-200 ${
            rendered ? "opacity-100" : "opacity-40"
          }`}
        />
        {!rendered && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loading size={16} className="text-slate-400" />
          </div>
        )}
      </div>
    </div>
  );
}
