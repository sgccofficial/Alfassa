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
    reader.onerror = () => reject(new Error("Failed to read audio data."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Audio Transcription Pathway (Sprint 5)
 * 
 * Performs actual speech-to-text transcription of audio files (.mp3, .wav, .m4a, .ogg, .webm, .aac, .flac).
 * Preserves the original audio file completely untouched.
 * Stores the transcript separately and links it directly to the Material.
 * Preserves timestamps [MM:SS] and genuine speaker labels where available.
 * Never invents summaries, concepts, or visual metadata.
 */
export async function processAudioPathway(
  material: Material,
  rawBlob?: Blob | null
): Promise<Partial<MaterialExtraction>> {
  try {
    let durationSeconds = material.metadata?.recordedDuration;
    let sampleRate: number | undefined;
    let channels: number | undefined;

    // Use Web Audio API to inspect audio buffer if blob is present
    if (rawBlob && typeof window !== "undefined" && (window.AudioContext || (window as any).webkitAudioContext)) {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtxClass();
        const arrayBuffer = await rawBlob.slice(0, 1024 * 1024).arrayBuffer(); // sample initial chunk for headers
        try {
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          durationSeconds = durationSeconds || audioBuffer.duration;
          sampleRate = audioBuffer.sampleRate;
          channels = audioBuffer.numberOfChannels;
        } catch {
          // If chunk decoding fails (some formats need full file)
        } finally {
          if (ctx.state !== "closed") {
            ctx.close().catch(() => {});
          }
        }
      } catch (audioCtxErr) {
        console.warn("Web Audio inspection error:", audioCtxErr);
      }
    }

    let activeBlob = rawBlob;

    // Fallback to dataUrl if blob was not directly provided
    if (!activeBlob && material.originalInput?.dataUrl) {
      try {
        const res = await fetch(material.originalInput.dataUrl);
        activeBlob = await res.blob();
      } catch (e) {
        console.warn("Could not fetch blob from dataUrl for audio transcription:", e);
      }
    }

    if (!activeBlob) {
      return {
        processingStatus: "failed",
        pathwayUsed: "audio_transcription",
        error: {
          code: "AUDIO_SOURCE_UNAVAILABLE",
          message: "Original audio binary is unavailable for transcription.",
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    // Technical constraint check: 35 MB transmission limit
    if (activeBlob.size > 35 * 1024 * 1024) {
      return {
        processingStatus: "failed",
        pathwayUsed: "audio_transcription",
        error: {
          code: "FILE_TOO_LARGE",
          message: "Audio file exceeds the 35 MB size limit for transcription.",
          timestamp: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      };
    }

    // Convert audio to base64
    const { base64, mimeType } = await blobToBase64(activeBlob);

    // Call server-side transcription endpoint
    const response = await fetch("/api/transcribe-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaBase64: base64,
        mimeType: mimeType || material.metadata?.mimeType || "audio/mp3",
        fileName: material.originalInput?.fileName || material.title,
        mediaType: "audio",
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        processingStatus: "failed",
        pathwayUsed: "audio_transcription",
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
        pathwayUsed: "audio_transcription",
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
      durationSeconds: durationSeconds ? Math.round(durationSeconds * 10) / 10 : undefined,
      sampleRate,
      channels,
      segments: data.segments && data.segments.length > 0 ? data.segments : [],
      speakerCount: data.speakerCount,
    };

    return {
      processingStatus: data.status === "partially_completed" ? "partially_completed" : "completed",
      pathwayUsed: "audio_transcription",
      extractedText: data.text,
      transcriptResult,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      processingStatus: "failed",
      pathwayUsed: "audio_transcription",
      error: {
        code: "AUDIO_PROCESSING_ERROR",
        message: error instanceof Error ? error.message : "Audio processing failed.",
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
  }
}
