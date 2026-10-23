import { parseAndFormatOcrTables } from "./table-formatter";
import { ExtractedTable } from "../../types";

/**
 * Optical Character Recognition (OCR) Output Sanitizer & Formatter (Sprint 5B)
 * 
 * Ensures faithful structural fidelity of extracted OCR content:
 * 1. REMOVES OCR ARTIFACTS (ABSOLUTELY NO HTML):
 *    - Strips model-generated HTML tags (<br>, <b>, </b>, <i>, </i>, <p>, <span>, <div>, etc.)
 *    - Replaces accidental <br> with real newlines (\n) to preserve cell layout without HTML markup
 *    - Removes repeated "^" characters used as substitutes for merged/continued table cells
 *    - Decodes HTML entities (&amp;, &nbsp;, etc.)
 * 2. PRESERVES TABLE STRUCTURE & MULTI-LINE CELLS:
 *    - Retains tabular content as clean, readable Markdown tables
 *    - Retains row order (e.g. Monday–Saturday) and distinguishable time columns
 *    - Retains visual line breaks inside cells (e.g. Thursday 1–3 Weeks/4th Week, Friday Pandemic Module, Saturday weekly schedules)
 *    - Where source uses merged cells or a value continues across rows, represents that naturally
 * 3. SPACING & FORMATTING FIDELITY:
 *    - Preserves meaningful spacing around slashes, parentheses, hyphens, abbreviations
 *    - Normalizes obvious formatting inconsistencies (e.g. 8.00Am -> 8.00 AM, Date:07.09.2026 -> Date: 07.09.2026)
 *    - Does NOT change underlying words, numbers, dates, or meaning
 * 4. STRICT VERBATIM PRINCIPLE:
 *    - No summarization, explanations, or hallucinations
 *    - Preserves slide/page boundaries (---) and normal non-tabular paragraphs
 */

export function sanitizeOcrText(rawText: string | null | undefined): string {
  if (!rawText) return "";

  let s = String(rawText);

  // 1. Strip markdown fences if added around whole document
  s = s.replace(/^```[a-zA-Z]*\r?\n?/gm, "").replace(/\r?\n?```$/gm, "");

  // 2. Decode common HTML entities early
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/&apos;/gi, "'");
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // 3. Collapse vertically stacked letters with <br> or tags (e.g. C<br>L<br>I<br>N<br>I<br>C<br>A<br>L<br>S -> CLINICALS)
  s = s.replace(/(^|[^A-Za-z0-9])([A-Za-z](?:\s*<br\s*\/?>\s*[A-Za-z]){2,})(?=[^A-Za-z0-9]|$)/gi, (_match, prefix, chars) => {
    return prefix + chars.replace(/<br\s*\/?>/gi, "").replace(/\s+/g, "");
  });
  s = s.replace(/(?:<(?:p|div|span)>\s*([A-Za-z])\s*<\/(?:p|div|span)>\s*){3,}/gi, (match) => {
    return match.replace(/<[^>]+>/g, "").replace(/\s+/g, "") + "\n";
  });

  // 4. Strip inline formatting tags (<b>text</b> -> text, <i>text</i> -> text)
  // Ensure word boundary \b so <br> is not accidentally matched by <b>
  s = s.replace(/<\/?(?:b|strong|i|em|u|span|font|mark|small|sub|sup)\b[^>]*>/gi, "");

  // 5. Convert block element closings to paragraph breaks (preserving table tags)
  s = s.replace(/<\/(?:p|div|h[1-6]|li|blockquote|section|article)>/gi, "\n\n");

  // 6. Fix cramped spacing around parentheses (e.g. "Medicine(1-3 Weeks)" -> "Medicine (1-3 Weeks)", "(1-3 Weeks)Ortho" -> "(1-3 Weeks) Ortho")
  s = s.replace(/([a-zA-Z0-9])\(/g, "$1 (");
  s = s.replace(/\)([a-zA-Z0-9])/g, ") $1");

  // 7. Table processing & structural fidelity (Sprint 5B)
  // Process tables BEFORE converting <br> across the whole document, so that <br> inside table cells
  // is parsed into cell lines without breaking pipe rows.
  const { formattedText } = parseAndFormatOcrTables(s);
  s = formattedText;

  // 8. Convert any remaining <br> tags in non-table text to real newlines \n
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // 9. Strip any lingering HTML tags that might have survived table parsing
  s = s.replace(/<[^>]+>/g, "");

  // 11. Collapse plain-text vertical single-letter runs (e.g. C \n L \n I \n N \n I \n C \n A \n L \n S)
  const postLines = s.split(/\r?\n/);
  const resultLines: string[] = [];
  let singleLetterRun: string[] = [];

  for (let i = 0; i < postLines.length; i++) {
    const trimmed = postLines[i].trim();
    if (/^[A-Za-z]$/.test(trimmed)) {
      singleLetterRun.push(trimmed);
    } else {
      if (singleLetterRun.length >= 3) {
        resultLines.push(singleLetterRun.join(""));
      } else if (singleLetterRun.length > 0) {
        resultLines.push(...singleLetterRun);
      }
      singleLetterRun = [];
      resultLines.push(postLines[i]);
    }
  }
  if (singleLetterRun.length >= 3) {
    resultLines.push(singleLetterRun.join(""));
  } else if (singleLetterRun.length > 0) {
    resultLines.push(...singleLetterRun);
  }

  s = resultLines.join("\n");

  // 12. Light Formatting Normalization (without changing words, numbers, dates, or meaning):
  // 12a. Time normalization:
  //      8.00Am -> 8.00 AM
  //      9.00 Am -> 9.00 AM
  //      12.00Pm -> 12.00 PM
  //      8:00am -> 8:00 AM
  //      1:00pm -> 1:00 PM
  s = s.replace(/\b(\d{1,2}[:.]\d{2})\s*([aApP])\.?([mM])\.?\b/g, (_match, time, p1, p2) => {
    return time + " " + (p1 + p2).toUpperCase();
  });

  // 12b. Missing space after colon for standard labels and dates:
  //      Date:07.09.2026 -> Date: 07.09.2026
  //      Time:9:00 -> Time: 9:00
  //      Batch:2026 -> Batch: 2026
  s = s.replace(/\b(Date|Time|Batch|Day|Hall|Venue|Year|Term|Semester|Period|Room|Subject|Total|Name|No|Ref|Reg\.?\s*No|Roll\s*No):([^\s/])/gi, (_match, prefix, nextChar) => {
    return prefix + ": " + nextChar;
  });

  // 13. Normalize whitespace while preserving paragraphs and table lines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.split("\n").map((l) => l.trimEnd()).join("\n");
  s = s.replace(/\n{4,}/g, "\n\n\n");

  return s.trim();
}

/**
 * Extracts structured ExtractedTable objects from raw OCR text
 */
export function extractTablesFromOcrText(rawText: string | null | undefined): ExtractedTable[] {
  if (!rawText) return [];
  const { tables } = parseAndFormatOcrTables(rawText);
  return tables;
}
