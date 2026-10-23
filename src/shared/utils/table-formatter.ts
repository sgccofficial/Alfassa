import { ExtractedTable, ExtractedTableRow, ExtractedTableCell } from "../../types";

/**
 * Optical Character Recognition (OCR) Table Formatter & Structure Engine (Sprint 5B)
 * 
 * Preserves structural fidelity of tabular data:
 * - Retains row order, column order, and cell boundaries
 * - Preserves line breaks inside multi-line cells without HTML tags (<br>)
 * - Formats readable Markdown-style tables with aligned columns and row separators
 * - Converts carets (^) and ditto marks into natural continuations without inventing data
 * - Parses and extracts structured ExtractedTable representations
 */

/**
 * Formats an ExtractedTable into a clean, readable Markdown-style table
 * where multi-line cells retain their visual line breaks cleanly across columns.
 */
export function formatTableAsReadableMarkdown(table: ExtractedTable): string {
  if (!table || (!table.headers?.length && !table.rows?.length)) {
    return "";
  }

  const rawHeaders = table.headers || [];
  const rows = table.rows || [];

  // Determine total column count
  let colCount = rawHeaders.length;
  for (const row of rows) {
    if (row.cells?.length > colCount) {
      colCount = row.cells.length;
    }
  }

  if (colCount === 0) return "";

  // Normalize headers
  const headers: string[] = [];
  for (let c = 0; c < colCount; c++) {
    headers.push(rawHeaders[c]?.trim() || `Col ${c + 1}`);
  }

  // Pre-process rows: ensure each cell has a clean lines array
  interface ProcessedCell {
    lines: string[];
  }
  interface ProcessedRow {
    cells: ProcessedCell[];
    isHeader?: boolean;
  }

  const processedRows: ProcessedRow[] = [];
  for (const row of rows) {
    const processedCells: ProcessedCell[] = [];
    for (let c = 0; c < colCount; c++) {
      const cell = row.cells?.[c];
      let lines: string[] = [];
      if (cell?.lines && Array.isArray(cell.lines) && cell.lines.length > 0) {
        lines = cell.lines.map((l) => String(l || "").trim()).filter((l) => l.length > 0);
      } else if (cell?.text) {
        lines = String(cell.text)
          .replace(/<br\s*\/?>/gi, "\n")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
      }

      if (lines.length === 0) {
        lines = [""];
      }
      processedCells.push({ lines });
    }
    processedRows.push({ cells: processedCells, isHeader: row.isHeader });
  }

  // Calculate column widths
  const colWidths: number[] = headers.map((h) => Math.max(3, h.length));
  for (const pRow of processedRows) {
    for (let c = 0; c < colCount; c++) {
      for (const line of pRow.cells[c].lines) {
        colWidths[c] = Math.max(colWidths[c], line.length);
      }
    }
  }

  // Cap column widths at reasonable max to avoid extreme spacing, but maintain readability
  for (let c = 0; c < colCount; c++) {
    colWidths[c] = Math.min(Math.max(colWidths[c], 5), 45);
  }

  const padCell = (text: string, width: number): string => {
    if (text.length > width) {
      // Don't truncate words aggressively; if line exceeds width, keep full text with minimal padding
      return text;
    }
    return text.padEnd(width, " ");
  };

  const outputLines: string[] = [];

  // 1. Header row
  const headerCells = headers.map((h, c) => padCell(h, colWidths[c]));
  outputLines.push(`| ${headerCells.join(" | ")} |`);

  // 2. Header separator (|:---|:---|)
  const headerSeparators = colWidths.map((w) => ":" + "-".repeat(Math.max(3, w - 1)));
  outputLines.push(`|${headerSeparators.join("|")}|`);

  // 3. Body rows
  for (let r = 0; r < processedRows.length; r++) {
    const pRow = processedRows[r];
    const maxSubLines = Math.max(...pRow.cells.map((c) => c.lines.length), 1);

    for (let lineIdx = 0; lineIdx < maxSubLines; lineIdx++) {
      const lineCells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const text = pRow.cells[c]?.lines[lineIdx] || "";
        lineCells.push(padCell(text, colWidths[c]));
      }
      outputLines.push(`| ${lineCells.join(" | ")} |`);
    }

    // Row divider to keep rows (e.g. days Monday-Saturday) visually distinct
    if (r < processedRows.length - 1) {
      const rowDividers = colWidths.map((w) => "-".repeat(Math.max(3, w)));
      outputLines.push(`|-${rowDividers.join("-|-")}-|`);
    }
  }

  const tableStr = outputLines.join("\n");
  if (table.title?.trim()) {
    return `### ${table.title.trim()}\n\n${tableStr}`;
  }
  return tableStr;
}

/**
 * Parses raw text (which may contain HTML tables, markdown pipe tables, or carets)
 * into structured ExtractedTable objects and returns both the structured tables
 * and the cleanly formatted Markdown-style table text.
 */
export function parseAndFormatOcrTables(rawText: string): {
  tables: ExtractedTable[];
  formattedText: string;
} {
  if (!rawText) {
    return { tables: [], formattedText: "" };
  }

  let text = String(rawText);

  // 1. First, check if text contains HTML <table>
  const htmlTableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const extractedTables: ExtractedTable[] = [];

  text = text.replace(htmlTableRegex, (_match, tableBody) => {
    const table: ExtractedTable = {
      headers: [],
      rows: [],
    };

    const rowMatches = tableBody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (let r = 0; r < rowMatches.length; r++) {
      const rowContent = rowMatches[r];
      const isHeaderRow = /<th[^>]*>/i.test(rowContent) || (r === 0 && table.headers.length === 0);
      const cellMatches = rowContent.match(/<(th|td)[^>]*>([\s\S]*?)<\/(th|td)>/gi) || [];

      const cells: ExtractedTableCell[] = [];
      for (const cellHtml of cellMatches) {
        // Convert <br> to newlines to preserve multi-line cell structure!
        const withNewlines = cellHtml.replace(/<br\s*\/?>/gi, "\n");
        const stripped = withNewlines.replace(/<[^>]+>/g, "").trim();
        const lines = stripped
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        cells.push({
          text: lines.join("\n"),
          lines: lines.length > 0 ? lines : [""],
        });
      }

      if (cells.length > 0) {
        if (isHeaderRow && table.headers.length === 0) {
          table.headers = cells.map((c) => c.text);
        } else {
          table.rows.push({ cells, isHeader: false });
        }
      }
    }

    if (table.rows.length > 0 || table.headers.length > 0) {
      extractedTables.push(table);
      return "\n\n" + formatTableAsReadableMarkdown(table) + "\n\n";
    }
    return "";
  });

  // 2. Parse Markdown pipe tables
  const lines = text.split(/\r?\n/);
  const resultLines: string[] = [];
  let currentTableRows: string[] = [];

  const flushCurrentTable = () => {
    if (currentTableRows.length === 0) return;

    const parsedTable = parsePipeTableBlock(currentTableRows);
    if (parsedTable) {
      extractedTables.push(parsedTable);
      resultLines.push(formatTableAsReadableMarkdown(parsedTable));
    } else {
      resultLines.push(...currentTableRows);
    }
    currentTableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
      currentTableRows.push(line);
    } else {
      flushCurrentTable();
      resultLines.push(line);
    }
  }
  flushCurrentTable();

  return {
    tables: extractedTables,
    formattedText: resultLines.join("\n"),
  };
}

/**
 * Parses a contiguous block of pipe-delimited lines into an ExtractedTable,
 * handling multi-line sub-rows, cell line breaks, and caret (^) continuation.
 */
function parsePipeTableBlock(lines: string[]): ExtractedTable | null {
  if (lines.length < 2) return null;

  const rawRows: string[][] = [];
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Check if line is a separator: |:---|:---|
    if (/^\|(\s*:?-+:?\s*\|)+$/.test(line)) {
      if (headerIndex === -1 && rawRows.length > 0) {
        headerIndex = rawRows.length - 1;
      }
      continue;
    }

    const rawCells = line.split("|");
    const cells = rawCells.slice(1, -1).map((c) => c.trim());
    if (cells.length > 0) {
      rawRows.push(cells);
    }
  }

  if (rawRows.length === 0) return null;

  let headers: string[] = [];
  let bodyRows: string[][] = [];

  if (headerIndex >= 0 && headerIndex < rawRows.length) {
    headers = rawRows[headerIndex];
    bodyRows = rawRows.filter((_, idx) => idx !== headerIndex);
  } else {
    // If no explicit separator, first row is header if more than 1 row exists
    if (rawRows.length > 1) {
      headers = rawRows[0];
      bodyRows = rawRows.slice(1);
    } else {
      headers = rawRows[0];
      bodyRows = [];
    }
  }

  const colCount = Math.max(headers.length, ...bodyRows.map((r) => r.length));
  // Normalize header length
  while (headers.length < colCount) {
    headers.push(`Col ${headers.length + 1}`);
  }

  // Parse body rows with caret continuation and line break preservation
  const rows: ExtractedTableRow[] = [];
  let previousRowCells: ExtractedTableCell[] | null = null;

  for (const rawRow of bodyRows) {
    const cells: ExtractedTableCell[] = [];

    // Check if this row is a sub-line continuation of the previous row
    // (e.g. empty first columns with content in other columns)
    const isSubLineContinuation =
      previousRowCells &&
      rawRow.length > 0 &&
      rawRow[0].length === 0 &&
      rawRow.some((c) => c.length > 0);

    if (isSubLineContinuation && previousRowCells) {
      // Append lines to previous row cells!
      for (let c = 0; c < colCount; c++) {
        const text = rawRow[c]?.trim() || "";
        if (text.length > 0 && previousRowCells[c]) {
          previousRowCells[c].lines.push(text);
          previousRowCells[c].text = previousRowCells[c].lines.join("\n");
        }
      }
      continue;
    }

    for (let c = 0; c < colCount; c++) {
      let cellText = rawRow[c]?.trim() || "";

      // Handle caret continuations e.g. "^"
      if (/^\^+(\s*\^+)*$/.test(cellText) || cellText === '"' || cellText === "''") {
        if (previousRowCells && previousRowCells[c] && previousRowCells[c].text.length > 0) {
          cells.push({
            text: previousRowCells[c].text,
            lines: [...previousRowCells[c].lines],
          });
        } else {
          cells.push({ text: "", lines: [""] });
        }
      } else {
        // Strip out any accidental <br> and preserve as newlines
        const withNewlines = cellText.replace(/<br\s*\/?>/gi, "\n");
        const lines = withNewlines
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        cells.push({
          text: lines.join("\n"),
          lines: lines.length > 0 ? lines : [""],
        });
      }
    }

    previousRowCells = cells;
    rows.push({ cells, isHeader: false });
  }

  return {
    headers,
    rows,
  };
}

/**
 * Combines header, tables, and footer text into a single cohesive document
 */
export function formatDocumentWithTables(
  headerText: string,
  tables: ExtractedTable[],
  footerText: string
): string {
  const parts: string[] = [];

  const cleanHeader = (headerText || "").trim();
  if (cleanHeader) {
    parts.push(cleanHeader);
  }

  if (tables && tables.length > 0) {
    for (const table of tables) {
      const formatted = formatTableAsReadableMarkdown(table);
      if (formatted) {
        parts.push(formatted);
      }
    }
  }

  const cleanFooter = (footerText || "").trim();
  if (cleanFooter) {
    parts.push(cleanFooter);
  }

  return parts.join("\n\n");
}
