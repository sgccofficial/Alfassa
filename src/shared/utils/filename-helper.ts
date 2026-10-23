/**
 * Filename normalization & immutability utilities (Sprint 6).
 *
 * Enforces that file extensions can NEVER be altered or removed through
 * editable filename fields.
 */

/**
 * Extracts a normalized lowercase extension from a filename or path (without dot)
 */
export function extractExtension(filename?: string): string {
  if (!filename) return "";
  const trimmed = filename.trim();
  // Do not treat URLs or protocols as files with extensions
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("://")) {
    return "";
  }
  const clean = trimmed.split("?")[0].split("#")[0];
  const parts = clean.split(".");
  if (parts.length <= 1) return "";
  const ext = parts[parts.length - 1];
  // Valid file extensions never contain slashes, colons, or spaces and are under 10 chars
  if (ext.includes("/") || ext.includes("\\") || ext.includes(" ") || ext.includes(":") || ext.length > 10) {
    return "";
  }
  return ext.toLowerCase().trim();
}

/**
 * Extracts the editable base name of a file, stripping any extension(s)
 * including multiple or foreign extensions.
 */
export function getBaseFileName(fileName?: string, expectedExt?: string): string {
  if (!fileName) return "Untitled";
  const trimmed = fileName.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("://")) {
    return trimmed;
  }
  let clean = trimmed;

  // Normalize expected extension without leading dot
  const ext = expectedExt ? expectedExt.replace(/^\./, "").toLowerCase().trim() : "";

  if (ext) {
    // If an expected extension is provided, strip it specifically if at end
    const extRegex = new RegExp(`\\.${ext}$`, "i");
    clean = clean.replace(extRegex, "").trim();
  }

  // Repeatedly strip known extension or any trailing .[a-zA-Z0-9]+ extensions
  // This handles: "example.pdf.pdf", "example.jpg.txt", "example.txt", etc.
  const trailingExtPattern = /\.[a-zA-Z0-9]{1,12}$/;
  while (trailingExtPattern.test(clean) && !clean.includes("://")) {
    const match = clean.match(trailingExtPattern);
    if (!match) break;
    clean = clean.slice(0, match.index).trim();
  }

  return clean || "Untitled";
}

/**
 * Central normalization function:
 * Ensures the resulting filename ALWAYS has the exact, immutable original extension.
 *
 * Rules:
 * - example.txt -> example.pdf
 * - example -> example.pdf
 * - example.jpg.txt -> example.pdf
 * - example.pdf.pdf -> example.pdf
 */
export function enforceImmutableExtension(
  inputName: string,
  immutableExt?: string
): string {
  const ext = (immutableExt || extractExtension(inputName)).replace(/^\./, "").toLowerCase().trim();
  const base = getBaseFileName(inputName, ext);

  if (!ext) {
    return base;
  }

  return `${base}.${ext}`;
}

/**
 * Validates whether a proposed new filename has retained the expected extension
 */
export function isExtensionPreserved(inputName: string, expectedExt: string): boolean {
  if (!expectedExt) return true;
  const targetExt = expectedExt.replace(/^\./, "").toLowerCase().trim();
  const currentExt = extractExtension(inputName);
  return currentExt === targetExt;
}
