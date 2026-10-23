import { 
  Material, 
  MaterialExtraction, 
  ExtractedDocumentStructure 
} from "../../../types";
import JSZip from "jszip";

/**
 * Document Extraction Pathway (SPRINT 4 & 8D)
 * 
 * Performs real content extraction for:
 * - PDF (.pdf)
 * - DOC (.doc)
 * - DOCX (.docx)
 * - PPT (.ppt)
 * - PPTX (.pptx)
 * - Plain text files (.txt, .md, .csv, .json, .rtf, .log)
 * 
 * Preserves the original uploaded file unchanged.
 * Extracts page boundaries for PDFs, slide boundaries for presentations,
 * headings/paragraphs/tables for Word documents, and verbatim text for plain text.
 */

function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractSlideTextFromXml(xmlString: string): string[] {
  const paragraphs: string[] = [];

  // 1. Robust DOMParser (Standard in browser environments)
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "application/xml");
      const parseError = doc.getElementsByTagName("parsererror");
      if (parseError.length === 0) {
        // Collect paragraphs: elements whose localName is "p"
        const allElements = doc.getElementsByTagName("*");
        const pElements: Element[] = [];
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i];
          if (el.localName && el.localName.toLowerCase() === "p") {
            pElements.push(el);
          }
        }

        if (pElements.length > 0) {
          for (const p of pElements) {
            // Find all <t> elements within this paragraph in document order (prefix-agnostic)
            const pChildren = p.getElementsByTagName("*");
            const tNodes: string[] = [];
            for (let j = 0; j < pChildren.length; j++) {
              const child = pChildren[j];
              if (child.localName && child.localName.toLowerCase() === "t") {
                const text = child.textContent || "";
                if (text.length > 0) {
                  tNodes.push(text);
                }
              }
            }
            const paraText = tNodes.join("").trim();
            if (paraText.length > 0) {
              paragraphs.push(paraText);
            }
          }
        } else {
          // If no <p> elements found, collect all elements whose localName is "t"
          const tElements: string[] = [];
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            if (el.localName && el.localName.toLowerCase() === "t") {
              const text = el.textContent || "";
              if (text.length > 0) {
                tElements.push(text);
              }
            }
          }
          const joined = tElements.join(" ").trim();
          if (joined.length > 0) {
            paragraphs.push(joined);
          }
        }

        if (paragraphs.length > 0) {
          return paragraphs;
        }
      }
    } catch (e) {
      console.warn("[DocumentParser] DOMParser exception:", e);
    }
  }

  // 2. Prefix-agnostic regex fallback for environments without DOMParser or on parse error
  const paraRegex = /<(?:\w+:)?p[\s>][\s\S]*?<\/(?:\w+:)?p>/gi;
  const pMatches = xmlString.match(paraRegex) || [];

  if (pMatches.length > 0) {
    for (const pXml of pMatches) {
      const tRegex = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi;
      const tPieces: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = tRegex.exec(pXml)) !== null) {
        const decoded = decodeXml(m[1].replace(/<[^>]+>/g, ""));
        if (decoded) tPieces.push(decoded);
      }
      const paraText = tPieces.join("").trim();
      if (paraText.length > 0) {
        paragraphs.push(paraText);
      }
    }
  } else {
    const tRegex = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi;
    const tPieces: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = tRegex.exec(xmlString)) !== null) {
      const decoded = decodeXml(m[1].replace(/<[^>]+>/g, ""));
      if (decoded) tPieces.push(decoded);
    }
    const joined = tPieces.join(" ").trim();
    if (joined.length > 0) {
      paragraphs.push(joined);
    }
  }

  return paragraphs;
}

async function extractPptxWithJSZip(
  blob: Blob,
  fileName: string
): Promise<Partial<MaterialExtraction> | null> {
  let zip: JSZip;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (err: any) {
    console.error("[DocumentParser] PPTX zip loading error:", err);
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      extractedText: "",
      error: {
        code: "PPTX_ZIP_ERROR",
        message: `Failed to open PPTX archive '${fileName}': ${err?.message || String(err)}`,
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
  }

  // Robust case-insensitive path check for slide XML files
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
    console.warn("[DocumentParser] No slide XML files found in PPTX zip package:", Object.keys(zip.files));
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      extractedText: "",
      error: {
        code: "PPTX_NO_SLIDES_FOUND",
        message: `No slide XML files found in presentation '${fileName}'.`,
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
  }

  const slideBlocks: { slideNumber: number; text: string; hasContent: boolean; title?: string }[] = [];
  const headings: string[] = [];

  for (let idx = 0; idx < slideFiles.length; idx++) {
    const slidePath = slideFiles[idx];
    const slideNumber = parseInt(slidePath.replace(/\\/g, "/").match(/slide\D*(\d+)/i)?.[1] || String(idx + 1), 10);
    let xml = "";
    try {
      xml = await zip.files[slidePath].async("string");
    } catch (readErr: any) {
      console.warn(`[DocumentParser] Could not read slide file ${slidePath}:`, readErr);
      continue;
    }

    const paraTexts = extractSlideTextFromXml(xml);
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
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      extractedText: "",
      documentStructure: {
        detectedFormat: "PPTX",
        slideCount: slideFiles.length,
        wordCount: 0,
        characterCount: 0,
      },
      error: {
        code: "NO_READABLE_TEXT",
        message: `No readable text could be extracted from '${fileName}'.`,
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
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

  return {
    processingStatus: isPartial ? "partially_completed" : "completed",
    pathwayUsed: "document_parser",
    extractedText: formattedSlides,
    documentStructure: {
      detectedFormat: "PPTX",
      slideCount: slideFiles.length,
      headings: headings.length > 0 ? headings : undefined,
      paragraphs: slideBlocks.map((s) => s.text).filter(Boolean).slice(0, 50),
      wordCount,
      characterCount: formattedSlides.length,
    },
    completedAt: new Date().toISOString(),
  };
}

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
    reader.onerror = () => reject(new Error("Failed to read file data."));
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

export async function processDocumentPathway(
  material: Material,
  rawBlobOrInput?: Blob | any
): Promise<Partial<MaterialExtraction>> {
  let rawBlob = extractRealBlob(rawBlobOrInput);
  const fileName = material.originalInput?.fileName || material.title || "document";
  const ext = (material.metadata?.extension || fileName.split(".").pop() || "").toLowerCase();
  const mimeType = material.metadata?.mimeType || material.originalInput?.fileType || "";

  // Fallback to dataUrl if blob was not provided directly
  if (!rawBlob && material.originalInput?.dataUrl) {
    try {
      const res = await fetch(material.originalInput.dataUrl);
      rawBlob = await res.blob();
    } catch (dataUrlErr) {
      console.warn("Could not retrieve blob from dataUrl in document parser:", dataUrlErr);
    }
  }

  // 2. Binary document extraction via server endpoint
  if (!rawBlob) {
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      error: {
        code: "FILE_BLOB_UNAVAILABLE",
        message: "Original document file is unavailable for extraction.",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // 2b. Check 25MB transmission limit before converting binary to base64 in memory
  if (rawBlob.size > 25 * 1024 * 1024) {
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      error: {
        code: "FILE_TOO_LARGE",
        message: `Document size (${Math.round(rawBlob.size / (1024 * 1024))}MB) exceeds 25MB limit for automated text extraction. Original preserved.`,
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
  }

  try {
    const { base64, mimeType: detectedMime } = await blobToBase64(rawBlob);

    const response = await fetch("/api/extract-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileBase64: base64,
        fileName,
        mimeType: detectedMime || mimeType,
        extension: ext,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return {
        processingStatus: "failed",
        pathwayUsed: "document_parser",
        error: {
          code: "DOCUMENT_API_ERROR",
          message: errJson.error || "Document extraction failed.",
          timestamp: new Date().toISOString(),
        },
      };
    }

    const data = await response.json();

    const structure: ExtractedDocumentStructure = {
      detectedFormat: data.detectedFormat || ext.toUpperCase(),
      pageCount: data.pageCount,
      slideCount: data.slideCount,
      headings: data.headings && data.headings.length > 0 ? data.headings : undefined,
      paragraphs: data.paragraphs,
      wordCount: data.wordCount,
      characterCount: data.characterCount,
    };

    if (data.hasText && data.text && data.text.trim().length > 0) {
      const finalStatus = data.status === "partially_completed" ? "partially_completed" : "completed";
      return {
        processingStatus: finalStatus,
        pathwayUsed: "document_parser",
        extractedText: data.text,
        documentStructure: structure,
        completedAt: new Date().toISOString(),
      };
    }

    // Document has no readable text
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      documentStructure: structure,
      error: {
        code: "NO_READABLE_TEXT",
        message: `No readable text could be extracted from '${fileName}'.`,
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      processingStatus: "failed",
      pathwayUsed: "document_parser",
      error: {
        code: "EXTRACTION_EXCEPTION",
        message: error instanceof Error ? error.message : "Document extraction failed.",
        timestamp: new Date().toISOString(),
      },
    };
  }
}
