import { Material, MaterialExtraction, ExtractedTranscriptResult } from "../../../types";

/**
 * Converts a Blob to a base64 string and mimeType.
 */
async function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const parts = dataUrl.split(",");
      const base64 = parts[1] || "";
      const mimeType = (parts[0] || "").split(";")[0].replace("data:", "") || blob.type;
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error("Failed to read video data."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Inspects video container metadata (resolution, duration, aspect ratio)
 */
async function inspectVideoMetadata(
  videoSource: string
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
    };
    video.onerror = () => {
      resolve({ duration: 0, width: 0, height: 0 });
    };
    video.src = videoSource;
  });
}

/**
 * Video Extraction Pathway (Sprint 5)
 * 
 * Extracts spoken content from video files (.mp4, .webm, .mov, .mkv, .avi) as verbatim text.
 * Preserves the original video file completely intact in storage.
 * Stores the transcript separately and links it directly to the Material.
 * Does NOT interpret or describe any visual content (no frame, scene, or visual understanding).
 * Preserves timestamps [MM:SS] and genuine speaker labels when available.
 */
export async function processVideoPathway(
  material: Material,
  rawBlob?: Blob | null
): Promise<Partial<MaterialExtraction>> {
  try {
    let videoSource = material.originalInput?.dataUrl;
    let tempObjectUrl: string | null = null;
    let activeBlob = rawBlob;

    if (!activeBlob && material.originalInput?.dataUrl) {
      try {
        const res = await fetch(material.originalInput.dataUrl);
        activeBlob = await res.blob();
      } catch (e) {
        console.warn("Could not fetch blob from dataUrl for video:", e);
      }
    }

    if (!videoSource && activeBlob) {
      tempObjectUrl = URL.createObjectURL(activeBlob);
      videoSource = tempObjectUrl;
    }

    let meta = { duration: 0, width: 0, height: 0 };
    if (videoSource) {
      meta = await inspectVideoMetadata(videoSource);
    }

    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
    }

    if (!activeBlob) {
      return {
        processingStatus: "failed",
        pathwayUsed: "video_pipeline",
        error: {
          code: "VIDEO_SOURCE_UNAVAILABLE",
          message: "Original video binary is unavailable for transcription.",
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    // Technical constraint check: 35 MB transmission limit
    if (activeBlob.size > 35 * 1024 * 1024) {
      return {
        processingStatus: "failed",
        pathwayUsed: "video_pipeline",
        error: {
          code: "FILE_TOO_LARGE",
          message: "Video file exceeds the 35 MB size limit for transcription.",
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    // Convert video to base64
    const { base64, mimeType } = await blobToBase64(activeBlob);

    // Call server-side transcription endpoint
    const response = await fetch("/api/transcribe-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaBase64: base64,
        mimeType: mimeType || material.metadata?.mimeType || "video/mp4",
        fileName: material.originalInput?.fileName || material.title,
        mediaType: "video",
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        processingStatus: "failed",
        pathwayUsed: "video_pipeline",
        error: {
          code: "TRANSCRIPTION_FAILED",
          message: errData.error || "Transcription couldn't be completed yet.",
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    const data = await response.json();

    if (!data.hasSpokenContent || data.status === "failed") {
      return {
        processingStatus: "failed",
        pathwayUsed: "video_pipeline",
        error: {
          code: "NO_SPOKEN_CONTENT",
          message: data.message || "Transcription couldn't be completed yet.",
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    const transcriptResult: ExtractedTranscriptResult = {
      text: data.text,
      durationSeconds: meta.duration > 0 ? Math.round(meta.duration * 10) / 10 : undefined,
      segments: data.segments && data.segments.length > 0 ? data.segments : [],
      speakerCount: data.speakerCount,
    };

    return {
      processingStatus: data.status === "partially_completed" ? "partially_completed" : "completed",
      pathwayUsed: "video_pipeline",
      extractedText: data.text,
      transcriptResult,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      processingStatus: "failed",
      pathwayUsed: "video_pipeline",
      error: {
        code: "VIDEO_PROCESSING_ERROR",
        message: error instanceof Error ? error.message : "Video transcription failed.",
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
  }
}
