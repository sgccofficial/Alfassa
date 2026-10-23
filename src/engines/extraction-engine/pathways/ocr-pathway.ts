import { Material, MaterialExtraction, ExtractedOcrResult, ExtractedTable } from "../../../types";
import { sanitizeOcrText, extractTablesFromOcrText } from "../../../shared/utils/ocr-sanitizer";

/**
 * Optical Character Recognition (OCR) Pathway for Images
 * 
 * Performs actual OCR text recognition on preserved images.
 * Results are stored strictly separate from the original image.
 * The original image is NEVER modified or overwritten.
 */

// Helper to load an image and extract its geometric dimensions
async function analyzeImageDimensions(
  src: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error("Image decoding failed."));
    img.src = src;
  });
}

// Helper to convert Blob into base64 data and mimeType
async function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const parts = dataUrl.split(",");
      const base64 = parts[1] || "";
      const mimeType = (parts[0] || "").split(";")[0].replace("data:", "") || blob.type || "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error("Failed to read image binary data."));
    reader.readAsDataURL(blob);
  });
}

function extractRealBlob(input: any): Blob | null {
  if (!input) return null;
  if (input instanceof Blob) return input;
  if (input.blob instanceof Blob) return input.blob;
  if (input.file instanceof Blob) return input.file;
  if (input.data instanceof Blob) return input.data;
  return null;
}

export async function processOcrPathway(
  material: Material,
  rawBlobOrInput?: Blob | any
): Promise<Partial<MaterialExtraction>> {
  let tempObjectUrl: string | null = null;
  const rawBlob = extractRealBlob(rawBlobOrInput);

  try {
    if (rawBlob && rawBlob.size > 25 * 1024 * 1024) {
      return {
        processingStatus: "failed",
        pathwayUsed: "ocr",
        error: {
          code: "FILE_TOO_LARGE",
          message: `Image size (${Math.round(rawBlob.size / (1024 * 1024))}MB) exceeds 25MB limit for automated OCR extraction. Original preserved.`,
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    let base64Data = "";
    let mimeType = material.metadata?.mimeType || "image/jpeg";
    let imageSource = material.originalInput?.dataUrl || "";

    // 1. Resolve image data and base64 payload
    if (rawBlob) {
      const converted = await blobToBase64(rawBlob);
      base64Data = converted.base64;
      mimeType = converted.mimeType || mimeType;
      if (!imageSource) {
        tempObjectUrl = URL.createObjectURL(rawBlob);
        imageSource = tempObjectUrl;
      }
    } else if (imageSource && imageSource.startsWith("data:")) {
      const parts = imageSource.split(",");
      base64Data = parts[1] || "";
      mimeType = (parts[0] || "").split(";")[0].replace("data:", "") || mimeType;
    } else if (imageSource && (imageSource.startsWith("blob:") || imageSource.startsWith("http"))) {
      try {
        const fetchRes = await fetch(imageSource);
        const fetchedBlob = await fetchRes.blob();
        const converted = await blobToBase64(fetchedBlob);
        base64Data = converted.base64;
        mimeType = converted.mimeType || mimeType;
      } catch (fetchErr) {
        console.log("Could not convert image source to blob:", fetchErr);
      }
    }

    if (!base64Data && !imageSource) {
      return {
        processingStatus: "failed",
        pathwayUsed: "ocr",
        error: {
          code: "IMAGE_UNAVAILABLE",
          message: "Text couldn't be extracted yet.",
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 2. Measure dimensions
    let dimensions = { width: 0, height: 0 };
    if (imageSource) {
      try {
        dimensions = await analyzeImageDimensions(imageSource);
      } catch (err) {
        console.log("Could not determine image dimensions:", err);
      }
    }

    // 3. Perform Actual Optical Character Recognition (OCR)
    // SPRINT 5: Real OCR processing via server-side vision engine
    let recognizedText = "";
    let hasReadableText = false;
    let detectedBlocksCount = 0;
    let extractedTables: ExtractedTable[] = [];
    let confidence: number | undefined = undefined;

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: base64Data,
          fileBase64: base64Data,
          mimeType,
          fileName: material.originalInput?.fileName || material.title || "",
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || "Text couldn't be extracted yet.");
      }

      const result = await response.json();
      recognizedText = (result.text || "").trim();
      hasReadableText = Boolean(
        (result.hasText !== false && recognizedText.length > 0) ||
        (recognizedText.length > 0 && recognizedText !== "NO_READABLE_TEXT")
      );
      detectedBlocksCount = result.detectedBlocksCount || 0;
      if (Array.isArray(result.tables) && result.tables.length > 0) {
        extractedTables = result.tables;
      }
      confidence = hasReadableText ? 0.98 : undefined;
    } catch (apiErr: any) {
      // If server OCR is unavailable, try native browser TextDetector API as fallback
      let fallbackSuccess = false;
      if (typeof window !== "undefined" && "TextDetector" in window && imageSource) {
        try {
          const imgElement = new window.Image();
          imgElement.src = imageSource;
          await new Promise((res) => {
            imgElement.onload = res;
          });
          const detector = new (window as any).TextDetector();
          const detectedItems = await detector.detect(imgElement);

          if (Array.isArray(detectedItems)) {
            recognizedText = detectedItems.map((item: any) => item.rawValue).join("\n").trim();
            hasReadableText = recognizedText.length > 0;
            detectedBlocksCount = detectedItems.length;
            confidence = hasReadableText ? 0.95 : undefined;
            fallbackSuccess = true;
          }
        } catch {
          // fallback also failed
        }
      }

      if (!fallbackSuccess) {
        return {
          processingStatus: "failed",
          pathwayUsed: "ocr",
          extractedText: "",
          error: {
            code: "OCR_FAILED",
            message: "Text couldn't be extracted yet.",
            details: apiErr?.message,
            timestamp: new Date().toISOString(),
          },
        };
      }
    } finally {
      if (tempObjectUrl) {
        URL.revokeObjectURL(tempObjectUrl);
      }
    }

    // 4. Construct Extracted OCR representation (strictly separated from original material)
    recognizedText = sanitizeOcrText(recognizedText);
    hasReadableText = recognizedText.length > 0;
    if (extractedTables.length === 0 && hasReadableText) {
      extractedTables = extractTablesFromOcrText(recognizedText);
    }

    const ocrResult: ExtractedOcrResult = {
      text: recognizedText,
      confidence,
      hasText: hasReadableText,
      detectedDimensions: dimensions.width > 0 ? dimensions : undefined,
      detectedBlocksCount: detectedBlocksCount || recognizedText.split("\n").filter(l => l.trim().length > 0).length,
      language: "und",
      tables: extractedTables.length > 0 ? extractedTables : undefined,
    };

    return {
      processingStatus: hasReadableText ? "completed" : "failed",
      pathwayUsed: "ocr",
      extractedText: hasReadableText ? recognizedText : "",
      ocrResult,
      completedAt: new Date().toISOString(),
      ...(hasReadableText
        ? {}
        : {
            error: {
              code: "NO_READABLE_TEXT",
              message: "Text couldn't be extracted yet.",
              timestamp: new Date().toISOString(),
            },
          }),
    };
  } catch (error: any) {
    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
    }
    return {
      processingStatus: "failed",
      pathwayUsed: "ocr",
      extractedText: "",
      error: {
        code: "OCR_FAILED",
        message: "Text couldn't be extracted yet.",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
    };
  }
}
