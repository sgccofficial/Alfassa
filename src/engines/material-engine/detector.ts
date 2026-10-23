import { MaterialType } from "../../types";

const DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "txt", "md", "markdown", "rtf", "odt", "epub", "csv", "json", "tex", "pages",
  "xlsx", "xls", "ods", "tsv", "html", "htm", "xml", "log", "form"
]);

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/html",
  "application/rtf",
  "application/epub+zip",
  "application/json",
  "application/xml",
  "text/xml"
]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif", "heic", "tiff"
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "mkv", "avi", "m4v", "wmv"
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "m4a", "ogg", "aac", "flac", "weba", "opus"
]);

/**
 * Extracts file extension in lowercase without dot
 */
export function getFileExtension(filename?: string): string {
  if (!filename) return "";
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase().trim() : "";
}

/**
 * Tests if a given string is a valid web link (http/https)
 */
export function isValidWebUrl(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Identifies the MaterialType based on file metadata or content
 */
export function detectMaterialType(input: {
  file?: File | Blob;
  fileName?: string;
  mimeType?: string;
  rawText?: string;
}): MaterialType {
  const { file, fileName, mimeType, rawText } = input;

  // 1. If explicit file or filename is provided
  const effectiveMime = (file?.type || mimeType || "").toLowerCase();
  const effectiveName = fileName || (file instanceof File ? file.name : "");
  const extension = getFileExtension(effectiveName);

  // Direct audio MIME check (e.g. audio/webm, audio/mp4, audio/ogg) must take precedence over video extension sets
  if (effectiveMime.startsWith("audio/")) {
    return "audio";
  }

  // Direct video MIME check
  if (effectiveMime.startsWith("video/")) {
    return "video";
  }

  // Image MIME or extensions
  if (effectiveMime.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  // Audio extensions
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  // Video extensions
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (
    DOCUMENT_MIME_TYPES.has(effectiveMime) ||
    effectiveMime.startsWith("text/") ||
    DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return "document";
  }

  // If a file was uploaded but doesn't match above, categorize as general file
  if (file || effectiveName) {
    return "file";
  }

  // 2. If rawText was provided (e.g. from paste or modal)
  if (rawText) {
    const trimmed = rawText.trim();
    if (isValidWebUrl(trimmed)) {
      return "link";
    }
    return "text";
  }

  return "file";
}
