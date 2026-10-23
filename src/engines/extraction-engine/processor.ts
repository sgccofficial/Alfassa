import { 
  Material, 
  MaterialExtraction, 
  ProcessingStatus, 
  ExtractionPathway 
} from "../../types";
import { processPlainTextPathway } from "./pathways/plain-text";
import { processDocumentPathway } from "./pathways/document-parser";
import { processOcrPathway } from "./pathways/ocr-pathway";
import { processAudioPathway } from "./pathways/audio-pathway";
import { processVideoPathway } from "./pathways/video-pathway";
import { processWebPathway } from "./pathways/web-pathway";
import { loadOriginalMaterial } from "../../services/material-file-loader";
import { getCachedExtractionByMaterialId } from "../../services/extraction-db";

function generateExtractionId(): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 9);
  return `ext_${timestamp}_${rand}`;
}

export function extractRealBlob(input: any): Blob | null {
  if (!input) return null;
  if (input instanceof Blob) return input;
  if (input.blob instanceof Blob) return input.blob;
  if (input.file instanceof Blob) return input.file;
  if (input.data instanceof Blob) return input.data;
  return null;
}

/**
 * Master Extraction Processor
 * 
 * Orchestrates isolated extraction pathways for all supported material types:
 * - Plain text
 * - PDF
 * - DOC/DOCX
 * - PPT/PPTX
 * - Images (OCR pathway)
 * - Audio (Speech-to-text pathway)
 * - Video (Audio/transcription pathway)
 * - Web links
 * 
 * Rules:
 * 1. NEVER modifies the original Material.
 * 2. Produces a separate MaterialExtraction linked to the original Material via materialId.
 * 3. Does not generate AI summaries or fabricated content.
 * 4. Records failures accurately if extraction cannot be completed.
 */
export async function extractFromMaterial(
  material: Material,
  providedBlob?: Blob | null
): Promise<MaterialExtraction> {
  const now = new Date().toISOString();

  if (!material || !material.id) {
    throw new Error("Invalid material provided for extraction");
  }

  // Reuse existing extraction ID on retry to prevent duplicating extractions (Requirement 6)
  const existingExtraction = getCachedExtractionByMaterialId(material.id, material.userId);
  const extractionId = existingExtraction?.id || generateExtractionId();

  // Retrieve raw binary via authoritative single loader (Requirements 9 & 10)
  let blob: Blob | null = extractRealBlob(providedBlob);
  if (!blob) {
    try {
      const retrieved = await loadOriginalMaterial(material);
      blob = extractRealBlob(retrieved);
    } catch (err) {
      console.warn("[ExtractionProcessor] Could not load original binary for extraction:", err);
    }
  }

  // Fallback to dataUrl if blob was not found
  if (!blob && material.originalInput?.dataUrl) {
    try {
      const res = await fetch(material.originalInput.dataUrl);
      blob = await res.blob();
    } catch (err) {
      console.warn("Could not retrieve blob from dataUrl for extraction:", err);
    }
  }

  let partialResult: Partial<MaterialExtraction> = {
    processingStatus: "pending",
    pathwayUsed: "generic_file",
  };

  const fileName = material.originalInput?.fileName || material.title || "";
  const ext = (material.metadata?.extension || fileName.split(".").pop() || "").toLowerCase();
  const mimeType = (material.metadata?.mimeType || material.originalInput?.fileType || "").toLowerCase();

  try {
    const isImage = 
      material.type === "image" ||
      mimeType.startsWith("image/") ||
      ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic", "tiff", "tif", "svg"].includes(ext);

    if (isImage) {
      partialResult = await processOcrPathway(material, blob);
    } else {
      switch (material.type) {
        case "text":
          partialResult = await processPlainTextPathway(material);
          break;

        case "document":
          partialResult = await processDocumentPathway(material, blob);
          break;

        case "audio":
          partialResult = await processAudioPathway(material, blob);
          break;

        case "video":
          partialResult = await processVideoPathway(material, blob);
          break;

        case "link":
          partialResult = await processWebPathway(material);
          break;

        case "file":
        default: {
          if (mimeType.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "aac", "weba"].includes(ext)) {
            partialResult = await processAudioPathway(material, blob);
          } else if (mimeType.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) {
            partialResult = await processVideoPathway(material, blob);
          } else {
            // All other files (PDF, DOCX, XLSX, CSV, Forms, TXT, RTF, etc.) go through document pathway
            partialResult = await processDocumentPathway(material, blob);
          }
          break;
        }
      }
    }
  } catch (error) {
    partialResult = {
      processingStatus: "failed",
      pathwayUsed: (partialResult.pathwayUsed as ExtractionPathway) || "generic_file",
      error: {
        code: "EXTRACTION_DISPATCHER_ERROR",
        message: error instanceof Error ? error.message : "Unhandled extraction error.",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Ensure state machine guarantee: must resolve to completed, partially_completed, or failed
  const finalStatus: ProcessingStatus = 
    partialResult.processingStatus === "completed" 
      ? "completed" 
      : partialResult.processingStatus === "partially_completed" 
      ? "partially_completed" 
      : "failed";

  const finalExtraction: MaterialExtraction = {
    id: extractionId,
    materialId: material.id,
    userId: material.userId,
    workspaceId: material.workspaceId,
    materialType: material.type,
    processingStatus: finalStatus,
    pathwayUsed: (partialResult.pathwayUsed as ExtractionPathway) || "generic_file",
    extractedText: partialResult.extractedText,
    documentStructure: partialResult.documentStructure,
    ocrResult: partialResult.ocrResult,
    transcriptResult: partialResult.transcriptResult,
    webResult: partialResult.webResult,
    error: partialResult.error || (finalStatus === "failed" ? {
      code: "EXTRACTION_FAILED",
      message: "Processing could not extract readable content.",
      timestamp: new Date().toISOString(),
    } : undefined),
    completedAt: partialResult.completedAt || (finalStatus === "completed" ? now : undefined),
    createdAt: now,
    updatedAt: now,
  };

  return finalExtraction;
}
