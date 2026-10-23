import { 
  Material, 
  MaterialExtraction, 
  ExtractedDocumentStructure, 
  DocumentSection 
} from "../../../types";

/**
 * Plain Text Extraction Pathway
 * 
 * Preserves the exact original text verbatim without modification,
 * and extracts readable document structure (paragraphs, headings, word/character counts).
 */
export async function processPlainTextPathway(
  material: Material,
  rawText?: string
): Promise<Partial<MaterialExtraction>> {
  const content = rawText || material.originalInput.rawContent || "";

  if (!content) {
    return {
      processingStatus: "failed",
      pathwayUsed: "plain_text",
      error: {
        code: "EMPTY_TEXT_CONTENT",
        message: "No textual content found in material input.",
        timestamp: new Date().toISOString(),
      }
    };
  }

  // Exact verbatim preservation for extracted representation
  const extractedText = content;

  // Extract structural properties
  const lines = content.split(/\r?\n/);
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const sections: DocumentSection[] = [];

  let currentHeading = "";
  let currentSectionContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSectionContent.length > 0) {
        paragraphs.push(currentSectionContent.join(" "));
        currentSectionContent = [];
      }
      continue;
    }

    // Markdown or generic headings detection
    if (trimmed.startsWith("#") || /^[A-Z0-9\s]{3,40}:$/.test(trimmed)) {
      if (currentSectionContent.length > 0) {
        sections.push({
          title: currentHeading || undefined,
          content: currentSectionContent.join("\n"),
        });
        paragraphs.push(currentSectionContent.join(" "));
        currentSectionContent = [];
      }
      const headingClean = trimmed.replace(/^#+\s*/, "").replace(/:$/, "");
      headings.push(headingClean);
      currentHeading = headingClean;
    } else {
      currentSectionContent.push(trimmed);
    }
  }

  if (currentSectionContent.length > 0) {
    sections.push({
      title: currentHeading || undefined,
      content: currentSectionContent.join("\n"),
    });
    paragraphs.push(currentSectionContent.join(" "));
  }

  // Count words and characters accurately
  const wordMatches = content.match(/\b\S+\b/g);
  const wordCount = wordMatches ? wordMatches.length : 0;
  const characterCount = content.length;

  const documentStructure: ExtractedDocumentStructure = {
    headings: headings.length > 0 ? headings : undefined,
    paragraphs: paragraphs.length > 0 ? paragraphs : [content],
    sections: sections.length > 0 ? sections : undefined,
    wordCount,
    characterCount,
    detectedFormat: "Plain Text / Markdown",
  };

  return {
    processingStatus: "completed",
    pathwayUsed: "plain_text",
    extractedText,
    documentStructure,
    completedAt: new Date().toISOString(),
  };
}
