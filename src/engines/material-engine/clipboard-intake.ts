import { isValidWebUrl } from "./detector";

export interface ExtractedClipboardData {
  kind: "files" | "urls" | "text" | "empty" | "unsupported";
  files?: File[];
  urls?: string[];
  text?: string;
  reason?: string;
}

/**
 * Normalizes an image file from clipboard if it lacks a distinct name
 */
function normalizeClipboardFile(file: File, index: number): File {
  if (file.name && file.name !== "image.png" && file.name !== "blob") {
    return file;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let extension = "png";
  if (file.type.includes("jpeg") || file.type.includes("jpg")) extension = "jpg";
  else if (file.type.includes("webp")) extension = "webp";
  else if (file.type.includes("gif")) extension = "gif";
  else if (file.type.includes("pdf")) extension = "pdf";

  const generatedName = file.type.startsWith("image/")
    ? `Pasted Image ${timestamp}${index > 0 ? ` (${index + 1})` : ""}.${extension}`
    : `Pasted Content ${timestamp}${index > 0 ? ` (${index + 1})` : ""}.${extension}`;

  return new File([file], generatedName, { type: file.type, lastModified: file.lastModified });
}

/**
 * Synchronously or asynchronously parses standard DataTransfer (from ClipboardEvent or DragEvent)
 */
export function extractFromDataTransfer(dataTransfer: DataTransfer | null): ExtractedClipboardData {
  if (!dataTransfer) {
    return {
      kind: "empty",
      reason: "No clipboard data was provided by the browser.",
    };
  }

  // 1. Check for files (documents, images, videos, audio, or arbitrary file drops/pastes)
  const collectedFiles: File[] = [];

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file && file.size >= 0) {
        collectedFiles.push(normalizeClipboardFile(file, i));
      }
    }
  }

  // Also inspect dataTransfer.items in case files or screenshot blobs are listed there
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          // Avoid duplicate reference if already in collectedFiles
          const exists = collectedFiles.some(
            (f) => f.name === file.name && f.size === file.size && f.type === file.type
          );
          if (!exists) {
            collectedFiles.push(normalizeClipboardFile(file, collectedFiles.length));
          }
        }
      }
    }
  }

  if (collectedFiles.length > 0) {
    return {
      kind: "files",
      files: collectedFiles,
    };
  }

  // 2. Check for URI lists (common when dragging links or copying links from some apps)
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList && uriList.trim().length > 0) {
    const urls = uriList
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0 && !u.startsWith("#") && isValidWebUrl(u));
    if (urls.length > 0) {
      return { kind: "urls", urls };
    }
  }

  // 3. Check for plain text or standard string data
  const rawText = dataTransfer.getData("text/plain") || dataTransfer.getData("text");
  if (rawText && rawText.length > 0) {
    const trimmed = rawText.trim();
    if (trimmed.length === 0) {
      return {
        kind: "empty",
        reason: "Pasted content contains only blank whitespace.",
      };
    }

    // Check if the text is composed of one or more URLs
    const lines = trimmed.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const allUrls = lines.length > 0 && lines.every((l) => isValidWebUrl(l));

    if (allUrls) {
      return {
        kind: "urls",
        urls: lines,
      };
    }

    // Otherwise, accept the raw text verbatim without alteration
    return {
      kind: "text",
      text: rawText,
    };
  }

  // 4. If types exist but neither file nor text was extractable
  if (dataTransfer.types && dataTransfer.types.length > 0) {
    return {
      kind: "unsupported",
      reason: `Unsupported clipboard format [${dataTransfer.types.join(", ")}]. Alfassa preserves documents, images, videos, audio, web links, and text.`,
    };
  }

  return {
    kind: "empty",
    reason: "The clipboard is empty. Copy some text, an image, a link, or a file, then paste again.",
  };
}

/**
 * Reads from the Modern Async Clipboard API (for mobile/touch screens or explicit paste buttons)
 */
export async function readFromAsyncClipboard(): Promise<ExtractedClipboardData> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return {
      kind: "unsupported",
      reason: "The async Clipboard API is not supported in this browser. You can use standard keyboard paste (Ctrl+V / ⌘V).",
    };
  }

  // Try navigator.clipboard.read() first (handles rich media, images, files where supported)
  if (typeof navigator.clipboard.read === "function") {
    try {
      const items = await navigator.clipboard.read();
      if (!items || items.length === 0) {
        return {
          kind: "empty",
          reason: "The clipboard is empty.",
        };
      }

      const files: File[] = [];
      const texts: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Check for image types
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = normalizeClipboardFile(
            new File([blob], "pasted-image", { type: imageType }),
            files.length
          );
          files.push(file);
          continue;
        }

        // Check for audio types
        const audioType = item.types.find((t) => t.startsWith("audio/"));
        if (audioType) {
          const blob = await item.getType(audioType);
          const file = normalizeClipboardFile(
            new File([blob], "pasted-audio", { type: audioType }),
            files.length
          );
          files.push(file);
          continue;
        }

        // Check for text
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          const textContent = await blob.text();
          if (textContent && textContent.trim().length > 0) {
            texts.push(textContent);
          }
        }
      }

      if (files.length > 0) {
        return { kind: "files", files };
      }

      if (texts.length > 0) {
        const combined = texts.join("\n\n");
        const trimmed = combined.trim();
        const lines = trimmed.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
        const allUrls = lines.length > 0 && lines.every((l) => isValidWebUrl(l));

        if (allUrls) {
          return { kind: "urls", urls: lines };
        }

        return { kind: "text", text: combined };
      }
    } catch (err: any) {
      // If permission denied or read() rejected, fall through to readText()
      if (err?.name === "NotAllowedError") {
        return {
          kind: "unsupported",
          reason: "Clipboard read access was not granted by your browser. Please allow clipboard permission or use keyboard paste (Ctrl+V / ⌘V).",
        };
      }
    }
  }

  // Fallback to navigator.clipboard.readText()
  if (typeof navigator.clipboard.readText === "function") {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length === 0) {
        return {
          kind: "empty",
          reason: "The clipboard is empty. Copy some text, a web link, an image, or a file, then try again.",
        };
      }

      const trimmed = text.trim();
      const lines = trimmed.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
      const allUrls = lines.length > 0 && lines.every((l) => isValidWebUrl(l));

      if (allUrls) {
        return { kind: "urls", urls: lines };
      }

      return { kind: "text", text };
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        return {
          kind: "unsupported",
          reason: "Clipboard read access was not granted by your browser. Please allow clipboard permission or use keyboard paste (Ctrl+V / ⌘V).",
        };
      }
      return {
        kind: "unsupported",
        reason: `Could not read from clipboard: ${err?.message || "Unknown error"}.`,
      };
    }
  }

  return {
    kind: "unsupported",
    reason: "Your browser does not permit automated clipboard reading. Please use keyboard paste (Ctrl+V / ⌘V).",
  };
}
