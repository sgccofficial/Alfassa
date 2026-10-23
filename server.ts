import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import JSZip from "jszip";
import pptToText from "ppt-to-text";
import * as XLSX from "xlsx";
import sharp from "sharp";
import { sanitizeOcrText, extractTablesFromOcrText } from "./src/shared/utils/ocr-sanitizer";
import { formatDocumentWithTables } from "./src/shared/utils/table-formatter";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large base64 image payloads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Web content fetch proxy
  app.post("/api/fetch-web-content", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing URL" });
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Remote server responded with HTTP status ${response.status}`,
          status: response.status,
        });
      }

      const text = await response.text();

      // Clean HTML entities helper
      const decodeHtmlEntities = (str: string) => {
        return str
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
          .trim();
      };

      // Extract title: og:title -> twitter:title -> <title>
      let title = "";
      const ogTitleMatch = text.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i) ||
                           text.match(/<meta[^>]*content=["'](.*?)["'][^>]*property=["']og:title["']/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        title = decodeHtmlEntities(ogTitleMatch[1]);
      }
      if (!title) {
        const twitterTitleMatch = text.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["'](.*?)["']/i) ||
                                  text.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']twitter:title["']/i);
        if (twitterTitleMatch && twitterTitleMatch[1]) {
          title = decodeHtmlEntities(twitterTitleMatch[1]);
        }
      }
      if (!title) {
        const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ""));
        }
      }

      // Extract description
      let description = "";
      const metaDescMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i) ||
                            text.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']description["']/i) ||
                            text.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i);
      if (metaDescMatch && metaDescMatch[1]) {
        description = decodeHtmlEntities(metaDescMatch[1]);
      }

      // Fallback clean title if not found in HTML
      if (!title) {
        try {
          const parsed = new URL(url);
          const parts = parsed.pathname.split("/").filter(Boolean);
          const last = parts.pop();
          title = last
            ? `${parsed.hostname} · ${decodeURIComponent(last).replace(/[-_]/g, " ").replace(/\.(html?|php)$/i, "")}`
            : parsed.hostname;
        } catch {
          title = url;
        }
      }

      res.json({
        text,
        contentType: response.headers.get("content-type"),
        title,
        description,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Helper to call Gemini models with automatic retries on transient errors (503 UNAVAILABLE, 429 RATE_LIMIT)
  // and intelligent fallback across supported models.
  async function generateContentWithRetry(
    ai: GoogleGenAI,
    primaryModel: string,
    contents: any,
    maxRetries = 2,
    config?: any
  ) {
    const candidateModels = [
      primaryModel,
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    let lastError: any = null;

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            ...(config ? { config } : {}),
          });
          return response;
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || "") + " " + String(err?.status || "") + " " + String(err?.code || "");
          
          // If model is discontinued or not found (404), immediately fail over to next model
          if (errStr.includes("404") || errStr.includes("NOT_FOUND") || errStr.includes("no longer available")) {
            console.log(`[Gemini API] Model ${model} unavailable (404/retired), switching to next candidate.`);
            break;
          }

          const isQuota = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED");
          if (isQuota) {
            // Immediately fail over to next candidate model with independent quota
            break;
          }

          const isTransient =
            errStr.includes("503") ||
            errStr.includes("UNAVAILABLE") ||
            errStr.includes("unavailable") ||
            errStr.includes("overloaded") ||
            errStr.includes("ECONNRESET");

          if (isTransient && attempt < maxRetries) {
            const delayMs = attempt * 800 + Math.floor(Math.random() * 400);
            console.log(`[Gemini API] Retrying on ${model} (attempt ${attempt}/${maxRetries}) in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          break;
        }
      }
    }

    throw lastError;
  }

  // Dedicated Optical Character Recognition (OCR) endpoint
  // strictly extracts and transcribes visible text verbatim without interpretation
  app.post("/api/ocr", async (req, res) => {
    try {
      const { imageBase64, fileBase64, mimeType, fileName } = req.body;
      const rawInput = imageBase64 || fileBase64;

      if (!rawInput || typeof rawInput !== "string") {
        return res.status(400).json({ error: "Missing or invalid base64 data." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

      // Clean base64: strip any data URL prefix and internal whitespace/newlines
      const cleanBase64 = rawInput.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "").trim();
      const buffer = Buffer.from(cleanBase64, "base64");

      const ext = (fileName ? fileName.split(".").pop() : "").toLowerCase().trim();
      let normalizedMime = (mimeType || "").toLowerCase().trim();

      const prefixMatch = rawInput.match(/^data:([^;]+);base64,/i);
      if (prefixMatch && !normalizedMime) {
        normalizedMime = prefixMatch[1].toLowerCase().trim();
      }

      // 1. Spreadsheets & Tabular Forms (.xlsx, .xls, .ods, .csv, .tsv)
      if (
        ["xlsx", "xls", "ods", "csv", "tsv"].includes(ext) ||
        normalizedMime.includes("spreadsheet") ||
        normalizedMime.includes("excel")
      ) {
        try {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetNames = workbook.SheetNames || [];
          const allTextParts: string[] = [];
          const structuredTables: any[] = [];

          for (const sheetName of sheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) continue;

            const csvData = XLSX.utils.sheet_to_csv(worksheet);
            if (csvData && csvData.trim().length > 0) {
              allTextParts.push(`--- Sheet: ${sheetName} ---\n${csvData.trim()}`);
            }

            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            if (Array.isArray(jsonData) && jsonData.length > 0) {
              const headers = (jsonData[0] || []).map((h) => String(h ?? ""));
              const rows = jsonData.slice(1).map((row) => ({
                cells: (row || []).map((c) => ({
                  text: String(c ?? ""),
                  lines: String(c ?? "").split("\n"),
                })),
              }));
              structuredTables.push({
                title: sheetName,
                headers,
                rows,
              });
            }
          }

          const fullSheetText = allTextParts.join("\n\n").trim();
          if (fullSheetText.length > 0) {
            const cleanText = sanitizeOcrText(fullSheetText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables: structuredTables,
              detectedBlocksCount: lines.length,
            });
          }
        } catch (excelErr) {
          console.warn("[OCR Endpoint] Spreadsheet extraction error:", excelErr);
        }
      }

      // 2. Plain text, SVG & Structured Code Files (.txt, .md, .csv, .json, .rtf, .log, .tsv, .xml, .html, .svg)
      if (
        ["txt", "md", "csv", "json", "rtf", "log", "tsv", "xml", "html", "htm", "css", "js", "ts", "svg"].includes(ext) ||
        normalizedMime.startsWith("text/") ||
        normalizedMime === "application/json" ||
        normalizedMime === "image/svg+xml"
      ) {
        const rawTextContent = buffer.toString("utf-8").trim();
        // If SVG, extract text inside <text> or <tspan> tags cleanly or use full markup text
        if (ext === "svg" || normalizedMime === "image/svg+xml") {
          const textMatches = Array.from(rawTextContent.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi))
            .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
            .filter(Boolean);
          if (textMatches.length > 0) {
            const cleanText = sanitizeOcrText(textMatches.join("\n"));
            const tables = extractTablesFromOcrText(cleanText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables,
              detectedBlocksCount: lines.length,
            });
          }
        }

        if (rawTextContent.length > 0) {
          const cleanText = sanitizeOcrText(rawTextContent);
          const tables = extractTablesFromOcrText(cleanText);
          const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
          return res.json({
            hasText: true,
            text: cleanText,
            tables,
            detectedBlocksCount: lines.length,
          });
        }
      }

      // 3. Word documents (.docx, .doc)
      if (ext === "docx" || normalizedMime.includes("wordprocessingml") || (cleanBase64.startsWith("UEsDB") && ext !== "pptx" && ext !== "xlsx")) {
        try {
          const rawResult = await mammoth.extractRawText({ buffer });
          const extractedText = (rawResult.value || "").trim();
          if (extractedText.length > 0) {
            const cleanText = sanitizeOcrText(extractedText);
            const tables = extractTablesFromOcrText(cleanText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables,
              detectedBlocksCount: lines.length,
            });
          }
        } catch (docxErr) {
          console.warn("[OCR Endpoint] DOCX extraction fallback error:", docxErr);
        }
      }

      if (ext === "doc" || normalizedMime === "application/msword") {
        try {
          const extractor = new WordExtractor();
          const doc = await extractor.extract(buffer);
          const bodyText = (doc.getBody() || "").trim();
          if (bodyText.length > 0) {
            const cleanText = sanitizeOcrText(bodyText);
            const tables = extractTablesFromOcrText(cleanText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables,
              detectedBlocksCount: lines.length,
            });
          }
        } catch (docErr) {
          console.warn("[OCR Endpoint] DOC extraction fallback error:", docErr);
        }
      }

      // 4. PowerPoint presentations (.pptx, .ppt)
      if (ext === "pptx" || normalizedMime.includes("presentationml")) {
        try {
          const zip = await JSZip.loadAsync(buffer);
          const slideFiles = Object.keys(zip.files)
            .filter((f) => /(?:^|\/)ppt\/slides\/slide[^\/]*\.xml$/i.test(f.replace(/\\/g, "/")))
            .sort((a, b) => {
              const numA = parseInt(a.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || "0", 10);
              const numB = parseInt(b.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || "0", 10);
              return numA - numB;
            });

          const slideTexts: string[] = [];
          for (let idx = 0; idx < slideFiles.length; idx++) {
            const slidePath = slideFiles[idx];
            const xml = await zip.files[slidePath].async("string");
            const tRegex = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi;
            const pieces: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = tRegex.exec(xml)) !== null) {
              const decoded = m[1].replace(/<[^>]+>/g, "").trim();
              if (decoded) pieces.push(decoded);
            }
            if (pieces.length > 0) {
              slideTexts.push(`--- Slide ${idx + 1} ---\n${pieces.join(" ")}`);
            }
          }

          const pptxText = slideTexts.join("\n\n").trim();
          if (pptxText.length > 0) {
            const cleanText = sanitizeOcrText(pptxText);
            const tables = extractTablesFromOcrText(cleanText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables,
              detectedBlocksCount: lines.length,
            });
          }
        } catch (pptxErr) {
          console.warn("[OCR Endpoint] PPTX extraction fallback error:", pptxErr);
        }
      }

      if (ext === "ppt" || normalizedMime === "application/vnd.ms-powerpoint") {
        try {
          const pres = pptToText.readBuffer(buffer);
          const resList = pptToText.utils.to_text(pres);
          const slideList = Array.isArray(resList) ? resList.map((t: string) => (typeof t === "string" ? t.trim() : "")) : [];
          const pptText = slideList.filter(Boolean).join("\n\n").trim();
          if (pptText.length > 0) {
            const cleanText = sanitizeOcrText(pptText);
            const tables = extractTablesFromOcrText(cleanText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables,
              detectedBlocksCount: lines.length,
            });
          }
        } catch (pptErr) {
          console.warn("[OCR Endpoint] PPT extraction fallback error:", pptErr);
        }
      }

      // 5. PDF Documents (.pdf)
      if (ext === "pdf" || normalizedMime === "application/pdf" || cleanBase64.startsWith("JVBERi0")) {
        try {
          const parser = new PDFParse({ data: buffer });
          const textResult = await parser.getText();
          if (parser && typeof parser.destroy === "function") {
            await parser.destroy().catch(() => {});
          }
          const rawPages: any[] = textResult?.pages || [];
          const pdfTexts = rawPages.map((p: any) => (p.text || "").trim()).filter((t: string) => t.length > 0);
          if (pdfTexts.length > 0) {
            const pdfTextCombined = pdfTexts.join("\n\n");
            const cleanText = sanitizeOcrText(pdfTextCombined);
            const tables = extractTablesFromOcrText(cleanText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              tables,
              detectedBlocksCount: lines.length,
            });
          }
        } catch (pdfParseErr) {
          console.warn("[OCR Endpoint] PDFParse local extraction failed, trying Gemini vision:", pdfParseErr);
        }
        normalizedMime = "application/pdf";
      }

      // 6. Images & Scanned Forms via Gemini Vision OCR Engine
      if (!ai) {
        return res.status(503).json({ error: "Text couldn't be extracted yet." });
      }

      let imageBufferForGemini = buffer;
      let geminiMime = normalizedMime;

      // Detect format via sharp metadata first, if possible
      try {
        const metadata = await sharp(buffer).metadata();
        if (metadata.format) {
          geminiMime = `image/${metadata.format}`;
        }
      } catch (e) {
        // Fallback to normalizedMime if metadata fails, default to image/jpeg if unknown
        if (!geminiMime || geminiMime === "application/pdf") geminiMime = normalizedMime || "image/jpeg";
      }

      // Convert any image format to PNG via Sharp to ensure compatibility with Gemini OCR
      if (geminiMime !== "application/pdf") {
        try {
          // Sharp will automatically detect the input format from the buffer
          imageBufferForGemini = await sharp(buffer).toFormat("png").toBuffer();
          geminiMime = "image/png";
        } catch (sharpErr) {
          console.error("[OCR Endpoint] Sharp conversion to PNG failed, trying original buffer with MIME:", geminiMime, sharpErr);
          // If conversion fails, proceed with original buffer anyway, let Gemini handle it
        }
      }

      const cleanGeminiBase64 = imageBufferForGemini.toString("base64");

      const prompt = `You are a high-precision Optical Character Recognition (OCR) engine.
Your sole job is to faithfully transcribe all readable text, words, numbers, and symbols present in this document/image verbatim into clean, structured text.

CRITICAL INSTRUCTIONS:

1. STRICT VERBATIM PRINCIPLE (NO INTERPRETATION):
   - Recognize visibly present content exactly as written.
   - Do NOT summarize, explain, correct facts, or reinterpret the source.
   - Do NOT infer missing text or invent words.
   - Do NOT expand abbreviations (e.g. keep "OBG & GYN", "AETCOM", "Ortho", "MBBS", etc. as written).
   - If a cell is blank in the source, keep it empty.

2. TABLE EXTRACTION & MULTI-LINE CELLS (PRIMARY DIRECTIVE):
   - When a table or schedule/timetable is present:
     * Preserve table boundaries, row order, and column order.
     * Retain all distinct columns.
     * PRESERVE EVERY LINE BREAK INSIDE MULTI-LINE CELLS!
     * A newline inside an original visual cell MUST remain a newline. Do NOT concatenate separate visual lines.
     * NEVER concatenate multi-line text into a single line.

3. REPEATED OR CONTINUED CELLS:
   - Where a value clearly continues across multiple rows or time periods, represent that value in each applicable cell or slot.
   - If text is oriented vertically, transcribe it as the complete horizontal word.

4. NO HTML ARTIFACTS:
   - ABSOLUTELY NEVER output HTML tags like <br>, <b>, <i>, <span>, <table>, <tr>, <td>, or any markup.
   - All line breaks must be real newlines (\\n).

5. SPACING:
   - Preserve natural spacing around slashes, parentheses, hyphens, abbreviations, numbers, units, and punctuation.

6. JSON OUTPUT FORMAT:
   Return a valid JSON object with the following structure:
   {
     "hasText": true,
     "headerText": "Transcribed text appearing before/above any table",
     "tables": [
       {
         "title": "Optional table title or null",
         "headers": ["Col 1", "Col 2"],
         "rows": [
           {
             "cells": [
               {
                 "text": "Cell text with \\n preserved",
                 "lines": ["Line 1", "Line 2"]
               }
             ]
           }
         ]
       }
     ],
     "footerText": "Transcribed text appearing after/below the table",
     "fullText": "Clean, formatted plain-text verbatim transcription of the entire document"
   }

   If the document has NO tables:
   Set "tables": [], put the full verbatim transcription in "fullText" (and "headerText"), and preserve all headings and paragraphs.

   If the document contains NO readable text whatsoever:
   Return: { "hasText": false, "headerText": "", "tables": [], "footerText": "", "fullText": "" }`;

      let response;
      try {
        response = await generateContentWithRetry(
          ai,
          "gemini-3.1-flash-lite",
          [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: cleanGeminiBase64,
                    mimeType: geminiMime,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          2,
          { responseMimeType: "application/json" }
        );
      } catch (genErr: any) {
        console.log("Gemini OCR generateContent unavailable after retries:", genErr?.message || genErr);
        
        // Fallback: Check if file binary contains readable text (ASCII / UTF-8)
        const utf8Attempt = buffer.toString("utf-8").replace(/[^\x20-\x7E\s]/g, " ").replace(/\s+/g, " ").trim();
        if (utf8Attempt.length >= 10) {
          const cleanText = sanitizeOcrText(utf8Attempt);
          const tables = extractTablesFromOcrText(cleanText);
          const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
          return res.json({
            hasText: true,
            text: cleanText,
            tables,
            detectedBlocksCount: lines.length,
          });
        }

        return res.status(503).json({
          hasText: false,
          text: "",
          tables: [],
          error: "Text couldn't be extracted yet.",
        });
      }

      const rawOutput = (response.text || "").trim();

      // Check if no readable text was detected
      if (
        !rawOutput ||
        rawOutput === "NO_READABLE_TEXT" ||
        rawOutput.toUpperCase().startsWith("NO_READABLE_TEXT")
      ) {
        return res.json({
          hasText: false,
          text: "",
          tables: [],
          detectedBlocksCount: 0,
        });
      }

      let cleanText = "";
      let structuredTables: any[] = [];
      let hasReadableText = false;

      // Extract JSON if wrapped in markdown code blocks
      let jsonCandidate = rawOutput.trim();
      const codeBlockMatch = jsonCandidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        jsonCandidate = codeBlockMatch[1].trim();
      }

      try {
        const parsed = JSON.parse(jsonCandidate);
        if (Array.isArray(parsed)) {
          cleanText = parsed
            .map((item: any) => (typeof item === "string" ? item : item.text || item.content || JSON.stringify(item)))
            .join("\n");
          hasReadableText = cleanText.trim().length > 0;
        } else if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.tables) && parsed.tables.length > 0) {
            structuredTables = parsed.tables;
            cleanText = formatDocumentWithTables(
              parsed.headerText || "",
              parsed.tables,
              parsed.footerText || ""
            );
          }
          if (!cleanText) {
            cleanText =
              parsed.fullText ||
              parsed.text ||
              parsed.headerText ||
              parsed.extractedText ||
              parsed.content ||
              parsed.transcription ||
              "";
          }
          hasReadableText = Boolean(
            parsed.hasText !== false &&
            (cleanText.trim().length > 0 || structuredTables.length > 0)
          );
        }
      } catch {
        // Fallback if model didn't return valid JSON
      }

      if (!cleanText && rawOutput && rawOutput !== "NO_READABLE_TEXT") {
        cleanText = rawOutput.replace(/```(?:json)?\s*|\s*```/gi, "").trim();
      }

      if (cleanText) {
        cleanText = sanitizeOcrText(cleanText);
        if (structuredTables.length === 0) {
          structuredTables = extractTablesFromOcrText(cleanText);
        }
      }

      hasReadableText = Boolean(
        cleanText &&
        cleanText.trim().length > 0 &&
        cleanText !== "NO_READABLE_TEXT"
      );

      if (!hasReadableText) {
        return res.json({
          hasText: false,
          text: "",
          tables: [],
          detectedBlocksCount: 0,
        });
      }

      const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);

      return res.json({
        hasText: true,
        text: cleanText,
        tables: structuredTables,
        detectedBlocksCount: lines.length,
      });
    } catch (err: any) {
      console.log("Server OCR processing error:", err?.message || err);
      return res.status(500).json({
        error: "Text couldn't be extracted yet.",
      });
    }
  });

  // Dedicated Audio & Video Speech Transcription endpoint (SPRINT 5)
  // Extracts spoken words verbatim from audio and video tracks.
  // Preserves original media untouched. Never invents visual descriptions, summaries, or concepts.
  app.post("/api/transcribe-media", async (req, res) => {
    try {
      const { mediaBase64, mimeType, fileName, mediaType } = req.body;

      if (!mediaBase64 || typeof mediaBase64 !== "string") {
        return res.status(400).json({ error: "Missing or invalid mediaBase64 data." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Transcription service configuration unavailable (missing API key)." });
      }

      const isVideo = mediaType === "video";
      const ext = (fileName ? fileName.split(".").pop() : "")?.toLowerCase() || "";

      // Normalize MIME type for Gemini audio/video intake
      let normalizedMime = mimeType || (isVideo ? "video/mp4" : "audio/mp3");
      if (isVideo) {
        if (ext === "webm" || normalizedMime.includes("webm")) normalizedMime = "video/webm";
        else if (ext === "mov" || normalizedMime.includes("quicktime")) normalizedMime = "video/quicktime";
        else if (ext === "mkv" || normalizedMime.includes("matroska")) normalizedMime = "video/x-matroska";
        else if (ext === "avi" || normalizedMime.includes("avi") || normalizedMime.includes("msvideo")) normalizedMime = "video/avi";
        else normalizedMime = "video/mp4";
      } else {
        if (ext === "wav" || normalizedMime.includes("wav")) normalizedMime = "audio/wav";
        else if (ext === "ogg" || normalizedMime.includes("ogg")) normalizedMime = "audio/ogg";
        else if (ext === "flac" || normalizedMime.includes("flac")) normalizedMime = "audio/flac";
        else if (ext === "webm" || ext === "weba" || normalizedMime.includes("webm")) normalizedMime = "audio/webm";
        else if (ext === "aac" || normalizedMime.includes("aac")) normalizedMime = "audio/aac";
        else if (ext === "m4a" || normalizedMime.includes("m4a")) normalizedMime = "audio/mp4";
        else normalizedMime = "audio/mp3";
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = isVideo 
        ? `You are an audio-only speech transcription engine processing a video file.
Your SOLE task is to transcribe what is spoken aloud in the video's audio track.

CRITICAL RULES:
1. Extract and transcribe ONLY the words that are actually spoken aloud word-for-word.
2. DO NOT describe any visual elements, actions, people, scenes, slides, text on screen, or visual events. Visual understanding is strictly prohibited.
3. If timestamps are discernible from the audio, format the transcript in clear chronological blocks:
[MM:SS]
spoken text

4. If multiple distinct speakers can be identified with high confidence, include speaker identifiers:
Speaker 1:
spoken text

Do not guess or fabricate speaker names. If only one speaker or speakers cannot be distinguished, omit speaker labels.
5. Do NOT summarize, explain, comment on, or edit what is spoken.
6. Do NOT add markdown code fences, headers, or conversational introductions/outros.
7. If there is NO spoken content or speech is completely inaudible (e.g. silent video, background music only, sound effects only), output EXACTLY:
NO_SPOKEN_CONTENT
8. If the speech cuts off or is only audible for a portion, transcribe all audible speech faithfully.`
        : `You are an audio speech transcription engine.
Your SOLE task is to transcribe what is spoken aloud in this audio file.

CRITICAL RULES:
1. Extract and transcribe ONLY the words that are actually spoken aloud word-for-word.
2. If timestamps are discernible, format the transcript in clear chronological blocks:
[MM:SS]
spoken text

3. If multiple distinct speakers can be identified with high confidence, include speaker identifiers:
Speaker 1:
spoken text

Do not guess or fabricate speaker names. If only one speaker or speakers cannot be distinguished, omit speaker labels.
4. Do NOT summarize, explain, comment on, or edit what is spoken.
5. Do NOT add markdown code fences, headers, or conversational introductions/outros.
6. If there is NO spoken content or speech is completely inaudible (e.g. silence, instrumental music only, sound effects only), output EXACTLY:
NO_SPOKEN_CONTENT
7. If the speech cuts off or is only audible for a portion, transcribe all audible speech faithfully.`;

      let response;
      try {
        response = await generateContentWithRetry(
          ai,
          "gemini-3.5-flash",
          [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: mediaBase64,
                    mimeType: normalizedMime,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          2
        );
      } catch (genErr: any) {
        console.log("Gemini media transcription generateContent error after retries:", genErr?.message || genErr);
        return res.status(503).json({
          status: "failed",
          error: "Transcription service is temporarily busy. Please retry.",
        });
      }

      const rawOutput = (response.text || "").trim();

      if (
        !rawOutput ||
        rawOutput === "NO_SPOKEN_CONTENT" ||
        rawOutput.toUpperCase().startsWith("NO_SPOKEN_CONTENT")
      ) {
        return res.json({
          hasSpokenContent: false,
          status: "failed",
          text: "",
          segments: [],
          message: "No spoken content could be detected in media.",
        });
      }

      // Clean fences if present
      let cleanText = rawOutput;
      if (cleanText.startsWith("```") && cleanText.endsWith("```")) {
        const lines = cleanText.split("\n");
        cleanText = lines.slice(1, -1).join("\n").trim();
      }

      // Parse timestamps & segments if present [MM:SS] or [HH:MM:SS]
      const segments: { start: number; end: number; text: string; speaker?: string }[] = [];
      const timestampBlockRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
      
      function parseSeconds(ts: string): number {
        const parts = ts.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
      }

      const matches = Array.from(cleanText.matchAll(timestampBlockRegex)) as RegExpMatchArray[];
      const speakersFound = new Set<string>();

      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          const currentMatch = matches[i];
          const timeStr = currentMatch[1];
          const startSeconds = parseSeconds(timeStr);
          const startIndex = (currentMatch.index ?? 0) + currentMatch[0].length;
          const nextIndex = i < matches.length - 1 ? (matches[i + 1].index ?? cleanText.length) : cleanText.length;
          const blockText = cleanText.substring(startIndex, nextIndex).trim();

          let speaker: string | undefined;
          let textOnly = blockText;
          const speakerMatch = blockText.match(/^(Speaker\s+\d+|Speaker\s+[A-Za-z]+):\s*/i);
          if (speakerMatch) {
            speaker = speakerMatch[1];
            speakersFound.add(speaker);
            textOnly = blockText.substring(speakerMatch[0].length).trim();
          }

          const endSeconds = i < matches.length - 1 ? parseSeconds(matches[i + 1][1]) : startSeconds + 10;
          segments.push({
            start: startSeconds,
            end: endSeconds,
            text: textOnly,
            speaker,
          });
        }
      } else {
        // Check if speaker labels exist even without timestamps
        const speakerMatches = cleanText.match(/Speaker\s+\d+/gi);
        if (speakerMatches) {
          speakerMatches.forEach(s => speakersFound.add(s));
        }
      }

      const finishReason = response.candidates?.[0]?.finishReason;
      const isPartial = finishReason && finishReason !== "STOP";

      return res.json({
        hasSpokenContent: true,
        status: isPartial ? "partially_completed" : "completed",
        text: cleanText,
        segments: segments.length > 0 ? segments : undefined,
        speakerCount: speakersFound.size > 0 ? speakersFound.size : undefined,
      });
    } catch (err: any) {
      console.log("Server media transcription error:", err?.message || err);
      return res.status(500).json({
        status: "failed",
        error: err?.message || "Transcription failed.",
      });
    }
  });

  // Dedicated Document Extraction endpoint (SPRINT 4)
  // Extracts readable text, structure, and boundaries for PDF, DOC, DOCX, PPT, PPTX, and TXT files.
  // Preserves original untouched; never invents text, summaries, or AI interpretations.
  app.post("/api/extract-document", async (req, res) => {
    try {
      const { fileBase64, fileName, mimeType, extension } = req.body;

      if (!fileBase64 || typeof fileBase64 !== "string") {
        return res.status(400).json({ error: "Missing or invalid fileBase64 data." });
      }

      const buffer = Buffer.from(fileBase64, "base64");
      const ext = (extension || (fileName ? fileName.split(".").pop() : "") || "").toLowerCase();
      const effectiveMime = (mimeType || "").toLowerCase();
      // 0. Spreadsheets & Tabular Forms (.xlsx, .xls, .ods, .csv, .tsv)
      if (
        ["xlsx", "xls", "ods", "csv", "tsv"].includes(ext) ||
        effectiveMime.includes("spreadsheet") ||
        effectiveMime.includes("excel")
      ) {
        try {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetNames = workbook.SheetNames || [];
          const allTextParts: string[] = [];

          for (const sheetName of sheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) continue;
            const csvData = XLSX.utils.sheet_to_csv(worksheet);
            if (csvData && csvData.trim().length > 0) {
              allTextParts.push(`--- Sheet: ${sheetName} ---\n${csvData.trim()}`);
            }
          }

          const fullSheetText = allTextParts.join("\n\n").trim();
          if (fullSheetText.length > 0) {
            const cleanText = sanitizeOcrText(fullSheetText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              status: "completed",
              detectedFormat: ext ? ext.toUpperCase() : "Spreadsheet",
              paragraphs: lines.slice(0, 50),
              wordCount: (cleanText.match(/\b\S+\b/g) || []).length,
              characterCount: cleanText.length,
            });
          }
        } catch (excelErr) {
          console.warn("[Document Extraction] Spreadsheet error:", excelErr);
        }
      }

      // 0c. Word documents (.docx, .doc)
      if (ext === "docx" || effectiveMime.includes("wordprocessingml") || (fileBase64.startsWith("UEsDB") && ext !== "pptx" && ext !== "xlsx")) {
        try {
          const rawResult = await mammoth.extractRawText({ buffer });
          const extractedText = (rawResult.value || "").trim();
          if (extractedText.length > 0) {
            const cleanText = sanitizeOcrText(extractedText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              status: "completed",
              detectedFormat: "DOCX",
              paragraphs: lines.slice(0, 50),
              wordCount: (cleanText.match(/\b\S+\b/g) || []).length,
              characterCount: cleanText.length,
            });
          }
        } catch (docxErr) {
          console.warn("[Document Extraction] DOCX extraction error:", docxErr);
        }
      }
      if (ext === "doc" || effectiveMime === "application/msword") {
        try {
          const extractor = new WordExtractor();
          const doc = await extractor.extract(buffer);
          const bodyText = (doc.getBody() || "").trim();
          if (bodyText.length > 0) {
            const cleanText = sanitizeOcrText(bodyText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              status: "completed",
              detectedFormat: "DOC",
              paragraphs: lines.slice(0, 50),
              wordCount: (cleanText.match(/\b\S+\b/g) || []).length,
              characterCount: cleanText.length,
            });
          }
        } catch (docErr) {
          console.warn("[Document Extraction] DOC extraction error:", docErr);
        }
      }

      // 0d. PowerPoint presentations (.pptx, .ppt)
      if (ext === "pptx" || effectiveMime.includes("presentationml")) {
        try {
          const zip = await JSZip.loadAsync(buffer);
          const slideFiles = Object.keys(zip.files)
            .filter((f) => /(?:^|\/)ppt\/slides\/slide[^\/]*\.xml$/i.test(f.replace(/\\/g, "/")))
            .sort((a, b) => {
              const numA = parseInt(a.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || "0", 10);
              const numB = parseInt(b.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || "0", 10);
              return numA - numB;
            });

          const slideTexts: string[] = [];
          for (let idx = 0; idx < slideFiles.length; idx++) {
            const slidePath = slideFiles[idx];
            const xml = await zip.files[slidePath].async("string");
            const tRegex = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi;
            const pieces: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = tRegex.exec(xml)) !== null) {
              const decoded = m[1].replace(/<[^>]+>/g, "").trim();
              if (decoded) pieces.push(decoded);
            }
            if (pieces.length > 0) {
              slideTexts.push(`--- Slide ${idx + 1} ---\n${pieces.join(" ")}`);
            }
          }

          const pptxText = slideTexts.join("\n\n").trim();
          if (pptxText.length > 0) {
            const cleanText = sanitizeOcrText(pptxText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              status: "completed",
              detectedFormat: "PPTX",
              slideCount: slideFiles.length,
              paragraphs: lines.slice(0, 50),
              wordCount: (cleanText.match(/\b\S+\b/g) || []).length,
              characterCount: cleanText.length,
            });
          }
        } catch (pptxErr) {
          console.warn("[Document Extraction] PPTX extraction error:", pptxErr);
        }
      }
      if (ext === "ppt" || effectiveMime === "application/vnd.ms-powerpoint") {
        try {
          const pres = pptToText.readBuffer(buffer);
          const resList = pptToText.utils.to_text(pres);
          const slideList = Array.isArray(resList) ? resList.map((t: string) => (typeof t === "string" ? t.trim() : "")) : [];
          const pptText = slideList.filter(Boolean).join("\n\n").trim();
          if (pptText.length > 0) {
            const cleanText = sanitizeOcrText(pptText);
            const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: cleanText,
              status: "completed",
              detectedFormat: "PPT",
              wordCount: (cleanText.match(/\b\S+\b/g) || []).length,
              characterCount: cleanText.length,
            });
          }
        } catch (pptErr) {
          console.warn("[Document Extraction] PPT extraction error:", pptErr);
        }
      }

      // 0b. Image files (.png, .jpg, .jpeg, .webp, .gif, .bmp, .tiff, .heic, .avif, .svg, image/*)
      if (
        ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif", "avif", "heic", "svg"].includes(ext) ||
        effectiveMime.startsWith("image/")
      ) {
        if (!process.env.GEMINI_API_KEY) {
          return res.status(503).json({ hasText: false, text: "", status: "failed", error: "Text couldn't be extracted yet." });
        }
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let imageBufferForGemini = buffer;
        let imageMime = effectiveMime.startsWith("image/") ? effectiveMime : `image/${ext === "jpg" ? "jpeg" : ext}`;
        
        // Detect format via sharp metadata first, if possible
        try {
          const metadata = await sharp(buffer).metadata();
          if (metadata.format) {
            imageMime = `image/${metadata.format}`;
          }
        } catch (e) {
          // Fallback to normalizedMime if metadata fails, default to image/jpeg if unknown
        }

        if (imageMime !== "image/png" && imageMime !== "image/jpeg" && imageMime !== "image/webp" && imageMime !== "image/gif") {
          try {
            imageBufferForGemini = await sharp(buffer).toFormat("png").toBuffer();
            imageMime = "image/png";
          } catch (sharpErr) {
            console.warn("[Document Extraction] Sharp image conversion failed:", sharpErr);
            // If conversion fails, proceed with original buffer anyway, let Gemini handle it
          }
        }

        const cleanBase64 = imageBufferForGemini.toString("base64");

        try {
          const ocrPrompt = `Transcribe all readable text, words, tables, schedules, headers, and numbers from this image verbatim into structured text. Preserve line breaks and table structures cleanly.`;
          const ocrResponse = await generateContentWithRetry(
            ai,
            "gemini-3.1-flash-lite",
            [
              {
                role: "user",
                parts: [
                  { inlineData: { data: cleanBase64, mimeType: imageMime } },
                  { text: ocrPrompt },
                ],
              },
            ],
            2
          );
          const ocrText = sanitizeOcrText((ocrResponse.text || "").trim());
          if (ocrText.length > 0) {
            const lines = ocrText.split(/\r?\n/).filter((l) => l.trim().length > 0);
            return res.json({
              hasText: true,
              text: ocrText,
              status: "completed",
              detectedFormat: ext ? ext.toUpperCase() : "Image",
              headings: lines.slice(0, 3),
              paragraphs: lines.slice(0, 50),
              wordCount: (ocrText.match(/\b\S+\b/g) || []).length,
              characterCount: ocrText.length,
            });
          }
        } catch (imgOcrErr) {
          console.warn("[Document OCR Image fallback] Failed:", imgOcrErr);
        }

        return res.json({
          hasText: false,
          text: "",
          status: "failed",
          detectedFormat: ext ? ext.toUpperCase() : "Image",
          wordCount: 0,
          characterCount: 0,
        });
      }

      // 1. Plain text files (.txt, .md, .csv, .json, .log, text/*)
      if (
        ["txt", "md", "csv", "json", "rtf", "log", "tsv", "xml"].includes(ext) ||
        effectiveMime.startsWith("text/")
      ) {
        const textContent = buffer.toString("utf-8");
        const trimmed = textContent.trim();
        const lines = textContent.split(/\r?\n/);
        const headings = lines
          .filter((l) => l.trim().startsWith("#"))
          .map((l) => l.trim().replace(/^#+\s*/, ""));
        const paragraphs = lines.filter((l) => l.trim().length > 0);
        const wordCount = (trimmed.match(/\b\S+\b/g) || []).length;

        return res.json({
          hasText: trimmed.length > 0,
          text: textContent,
          status: trimmed.length > 0 ? "completed" : "failed",
          detectedFormat: ext ? ext.toUpperCase() : "Plain Text",
          headings: headings.length > 0 ? headings : undefined,
          paragraphs: paragraphs.slice(0, 50),
          wordCount,
          characterCount: textContent.length,
        });
      }

      // 2. PDF Documents (.pdf, application/pdf)
      if (ext === "pdf" || effectiveMime === "application/pdf") {
        let parser: any = null;
        let textResult: any = null;
        try {
          parser = new PDFParse({ data: buffer });
          textResult = await parser.getText();
        } catch (pdfParseErr) {
          console.warn("[PDFParse] Local text extraction failed, attempting OCR fallback:", pdfParseErr);
        } finally {
          if (parser && typeof parser.destroy === "function") {
            try {
              await parser.destroy();
            } catch (_) {}
          }
        }

        const totalPages = textResult?.total || (textResult?.pages ? textResult.pages.length : 1);
        const rawPages: any[] = textResult?.pages || [];

        const pageSections: { pageNum: number; text: string; hasContent: boolean }[] = [];
        for (let i = 0; i < rawPages.length; i++) {
          const p = rawPages[i];
          const pageNum = p.num || (i + 1);
          const pText = (p.text || "").trim();
          pageSections.push({
            pageNum,
            text: pText,
            hasContent: pText.length > 0,
          });
        }

        const pagesWithContent = pageSections.filter((p) => p.hasContent);
        const totalCharCount = pageSections.reduce((acc, p) => acc + p.text.length, 0);

        if (pagesWithContent.length === 0 || totalCharCount < 50) {
          // Scanned, handwritten, or sparse text PDF fallback: try OCR via Gemini vision API
          if (process.env.GEMINI_API_KEY) {
            try {
              const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
              const ocrPrompt = `You are a high-precision document OCR engine. Transcribe all readable text, tables, schedules, headers, and numbers from this document verbatim. Preserve line breaks and table structures cleanly.`;
              const ocrResponse = await generateContentWithRetry(
                ai,
                "gemini-3.1-flash-lite",
                [
                  {
                    role: "user",
                    parts: [
                      {
                        inlineData: {
                          data: fileBase64,
                          mimeType: "application/pdf",
                        },
                      },
                      { text: ocrPrompt },
                    ],
                  },
                ],
                2
              );
              const ocrText = (ocrResponse.text || "").trim();
              if (ocrText.length > 0) {
                const ocrWordCount = (ocrText.match(/\b\S+\b/g) || []).length;
                return res.json({
                  hasText: true,
                  text: ocrText,
                  status: "completed",
                  detectedFormat: "PDF (OCR)",
                  pageCount: totalPages,
                  wordCount: ocrWordCount,
                  characterCount: ocrText.length,
                });
              }
            } catch (ocrErr) {
              console.warn("[PDF OCR Fallback] Failed:", ocrErr);
            }
          }

          if (totalCharCount === 0) {
            return res.json({
              hasText: false,
              text: "",
              status: "failed",
              detectedFormat: "PDF",
              pageCount: totalPages,
              wordCount: 0,
              characterCount: 0,
            });
          }
        }

          // Format with clear page boundaries
          const formattedText = pageSections
            .map((p) => {
              if (p.hasContent) {
                return `--- Page ${p.pageNum} ---\n${p.text}`;
              }
              return `--- Page ${p.pageNum} ---\n[No readable text on this page]`;
            })
            .join("\n\n");

          const isPartial = pagesWithContent.length < totalPages;
          const wordCount = (formattedText.match(/\b\S+\b/g) || []).length;

          // Detect potential headings from short standalone lines
          const headings: string[] = [];
          for (const p of pageSections) {
            if (!p.hasContent) continue;
            const pLines = p.text.split("\n");
            for (const line of pLines) {
              const tl = line.trim();
              // Improved heading detection:
              // 1. Minimum 5 characters to avoid "Age:", "Name:" labels
              // 2. Maximum 60 chars
              // 3. Must not end in : (common for form fields)
              // 4. Must not end in . (common for sentences)
              if (tl.length >= 5 && tl.length <= 60 && !tl.endsWith(":") && !tl.endsWith(".")) {
                if (headings.length < 15 && !headings.includes(tl)) {
                  headings.push(tl);
                }
              }
            }
          }

          return res.json({
            hasText: true,
            text: formattedText,
            status: isPartial ? "partially_completed" : "completed",
            detectedFormat: "PDF",
            pageCount: totalPages,
            headings: headings.length > 0 ? headings : undefined,
            wordCount,
            characterCount: formattedText.length,
          });
      }

      // 3. Word Documents (.docx, .doc)
      if (ext === "docx" || effectiveMime.includes("wordprocessingml")) {
        const rawResult = await mammoth.extractRawText({ buffer });
        const htmlResult = await mammoth.convertToHtml({ buffer });
        const extractedText = (rawResult.value || "").trim();

        if (!extractedText) {
          return res.json({
            hasText: false,
            text: "",
            status: "failed",
            detectedFormat: "DOCX",
            wordCount: 0,
            characterCount: 0,
          });
        }

        // Extract headings and paragraphs from docx HTML structure
        const headings: string[] = [];
        const hMatches = (htmlResult.value || "").match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) || [];
        for (const hm of hMatches) {
          const clean = hm.replace(/<[^>]+>/g, "").trim();
          if (clean && !headings.includes(clean)) {
            headings.push(clean);
          }
        }

        const pMatches = (htmlResult.value || "").match(/<p[^>]*>(.*?)<\/p>/gi) || [];
        const paragraphs = pMatches
          .map((p) => p.replace(/<[^>]+>/g, "").trim())
          .filter(Boolean);
        const wordCount = (extractedText.match(/\b\S+\b/g) || []).length;

        return res.json({
          hasText: true,
          text: extractedText,
          status: "completed",
          detectedFormat: "DOCX",
          headings: headings.length > 0 ? headings : undefined,
          paragraphs: paragraphs.slice(0, 50),
          wordCount,
          characterCount: extractedText.length,
        });
      }

      if (ext === "doc" || effectiveMime === "application/msword") {
        const extractor = new WordExtractor();
        const doc = await extractor.extract(buffer);
        const sections: string[] = [];
        const headers = doc.getHeaders({ includeFooters: true }) || "";
        const body = doc.getBody() || "";
        const footnotes = doc.getFootnotes() || "";

        if (headers.trim()) sections.push(headers.trim());
        if (body.trim()) sections.push(body.trim());
        if (footnotes.trim()) sections.push(`Footnotes:\n${footnotes.trim()}`);

        const extractedText = sections.join("\n\n").trim();

        if (!extractedText) {
          return res.json({
            hasText: false,
            text: "",
            status: "failed",
            detectedFormat: "DOC",
            wordCount: 0,
            characterCount: 0,
          });
        }

        const lines = extractedText.split(/\r?\n/);
        const paragraphs = lines.filter((l) => l.trim().length > 0);
        const wordCount = (extractedText.match(/\b\S+\b/g) || []).length;

        return res.json({
          hasText: true,
          text: extractedText,
          status: "completed",
          detectedFormat: "DOC",
          paragraphs: paragraphs.slice(0, 50),
          wordCount,
          characterCount: extractedText.length,
        });
      }

      // 4. PowerPoint Presentations (.pptx, .ppt)
      if (ext === "pptx" || effectiveMime.includes("presentationml")) {
        const decodeXml = (s: string) =>
          s
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(buffer);
        } catch (zipErr: any) {
          return res.status(400).json({
            hasText: false,
            error: `Failed to open PPTX archive '${fileName}': ${zipErr?.message || String(zipErr)}`,
            status: "failed",
          });
        }

        const slideFiles = Object.keys(zip.files)
          .filter((f) => {
            const normalized = f.replace(/\\/g, "/").toLowerCase();
            return /(?:^|\/)ppt\/slides\/slide[^\/]*\.xml$/i.test(normalized);
          })
          .sort((a, b) => {
            const numA = parseInt(a.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || "0", 10);
            const numB = parseInt(b.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || "0", 10);
            return numA - numB;
          });

        if (slideFiles.length === 0) {
          return res.json({
            hasText: false,
            text: "",
            status: "failed",
            detectedFormat: "PPTX",
            slideCount: 0,
            error: `No slide XML files found in presentation '${fileName}'.`,
          });
        }

        const slideBlocks: { slideNumber: number; text: string; hasContent: boolean; title?: string }[] = [];
        const headings: string[] = [];

        for (let idx = 0; idx < slideFiles.length; idx++) {
          const slidePath = slideFiles[idx];
          const slideNumber = parseInt(slidePath.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || String(idx + 1), 10);
          const xml = await zip.files[slidePath].async("string");

          // Prefix-agnostic paragraph and text run parsing
          const paraRegex = /<(?:\w+:)?p[\s>][\s\S]*?<\/(?:\w+:)?p>/gi;
          const pMatches = xml.match(paraRegex) || [];
          const paraTexts: string[] = [];

          if (pMatches.length > 0) {
            for (const pXml of pMatches) {
              const tRegex = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi;
              const tPieces: string[] = [];
              let m: RegExpExecArray | null;
              while ((m = tRegex.exec(pXml)) !== null) {
                const decoded = decodeXml(m[1].replace(/<[^>]+>/g, ""));
                if (decoded) tPieces.push(decoded);
              }
              const pText = tPieces.join("").trim();
              if (pText.length > 0) paraTexts.push(pText);
            }
          } else {
            const tRegex = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi;
            const tPieces: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = tRegex.exec(xml)) !== null) {
              const decoded = decodeXml(m[1].replace(/<[^>]+>/g, ""));
              if (decoded) tPieces.push(decoded);
            }
            const joined = tPieces.join(" ").trim();
            if (joined.length > 0) paraTexts.push(joined);
          }

          const slideText = paraTexts.join("\n").trim();
          let slideTitle: string | undefined;

          if (paraTexts.length > 0) {
            const firstLine = paraTexts[0].trim();
            if (firstLine.length >= 2 && firstLine.length <= 100 && !headings.includes(firstLine)) {
              slideTitle = firstLine;
              headings.push(firstLine);
            }
          }

          slideBlocks.push({
            slideNumber,
            text: slideText,
            hasContent: slideText.length > 0,
            title: slideTitle,
          });
        }

        const slidesWithContent = slideBlocks.filter((s) => s.hasContent);

        if (slidesWithContent.length === 0) {
          return res.json({
            hasText: false,
            text: "",
            status: "failed",
            detectedFormat: "PPTX",
            slideCount: slideFiles.length,
            error: `No readable text could be extracted from '${fileName}'.`,
          });
        }

        // Represent slide boundaries cleanly (e.g. --- Slide 1 ---)
        const formattedSlides = slideBlocks
          .map((s) => {
            if (s.hasContent) {
              return `--- Slide ${s.slideNumber} ---\n${s.text}`;
            }
            return `--- Slide ${s.slideNumber} ---\n[No readable text on this slide]`;
          })
          .join("\n\n");

        const isPartial = slidesWithContent.length < slideFiles.length;
        const wordCount = (formattedSlides.match(/\b\S+\b/g) || []).length;

        return res.json({
          hasText: true,
          text: formattedSlides,
          status: isPartial ? "partially_completed" : "completed",
          detectedFormat: "PPTX",
          slideCount: slideFiles.length,
          headings: headings.length > 0 ? headings : undefined,
          paragraphs: slideBlocks.map((s) => s.text).filter(Boolean).slice(0, 50),
          wordCount,
          characterCount: formattedSlides.length,
        });
      }

      if (ext === "ppt" || effectiveMime === "application/vnd.ms-powerpoint") {
        let slideTexts: string[] = [];
        try {
          const pres = pptToText.readBuffer(buffer);
          const resList = pptToText.utils.to_text(pres);
          if (Array.isArray(resList) && resList.length > 0) {
            slideTexts = resList.map((t: string) => (typeof t === "string" ? t.trim() : ""));
          }
        } catch (_) {}

        if (slideTexts.length === 0) {
          try {
            const raw = pptToText.extractText(buffer);
            if (typeof raw === "string" && raw.trim()) {
              slideTexts = [raw.trim()];
            }
          } catch (_) {}
        }

        if (slideTexts.length === 0 || slideTexts.every((t) => !t)) {
          return res.json({
            hasText: false,
            text: "",
            status: "failed",
            detectedFormat: "PPT",
            slideCount: 0,
          });
        }

        const formatted = slideTexts
          .map((t, idx) => (t ? `Slide ${idx + 1}\n${t}` : `Slide ${idx + 1}\n[No readable text on this slide]`))
          .join("\n\n");

        const slidesWithContent = slideTexts.filter((t) => t.length > 0);
        const isPartial = slidesWithContent.length < slideTexts.length;
        const wordCount = (formatted.match(/\b\S+\b/g) || []).length;

        return res.json({
          hasText: true,
          text: formatted,
          status: isPartial ? "partially_completed" : "completed",
          detectedFormat: "PPT",
          slideCount: slideTexts.length,
          wordCount,
          characterCount: formatted.length,
        });
      }

      // Fallback: try reading as UTF-8 string
      const fallbackText = buffer.toString("utf-8");
      const isPrintable = /^[\x20-\x7E\r\n\t\u00A0-\uFFFF]*$/.test(fallbackText.slice(0, 1000));
      if (isPrintable && fallbackText.trim().length > 0) {
        return res.json({
          hasText: true,
          text: fallbackText,
          status: "completed",
          detectedFormat: ext ? ext.toUpperCase() : "Document",
          wordCount: (fallbackText.match(/\b\S+\b/g) || []).length,
          characterCount: fallbackText.length,
        });
      }

      return res.json({
        hasText: false,
        text: "",
        status: "failed",
        detectedFormat: ext ? ext.toUpperCase() : "Binary Document",
      });
    } catch (err: any) {
      console.log("Server document extraction error:", err?.message || err);
      return res.status(500).json({
        hasText: false,
        text: "",
        status: "failed",
        error: err?.message || "Document extraction failed.",
      });
    }
  });

  // Vite middleware for development (HMR disabled in AI Studio preview)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Alfassa server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
