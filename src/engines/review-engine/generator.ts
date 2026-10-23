import { 
  Material, 
  MaterialExtraction, 
  Concept, 
  WorkspaceReview, 
  CandidateConcept, 
  CandidateSourceMaterial,
  ProposedRelationship, 
  ProposedChange,
  KnowledgeRelationType
} from "../../types";

/**
 * Extracts key domain terms from text (case-insensitive, filtering common stopwords)
 */
function extractDomainTerms(text: string): string[] {
  const stopWords = new Set([
    "the", "and", "a", "an", "in", "on", "at", "to", "for", "of", "with", "by", 
    "is", "are", "was", "were", "it", "that", "this", "from", "as", "be", "or", 
    "which", "an", "has", "have", "had", "not", "but", "what", "all", "when",
    "will", "can", "into", "more", "also", "been", "their", "there", "they",
    "about", "would", "could", "should", "than", "then", "some", "other"
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  return Array.from(new Set(words));
}

/**
 * Extracts candidate sentences or lines from text for citation extraction
 */
function splitIntoStatements(text: string): string[] {
  return text
    .split(/(?:\r?\n|[.!?]+)/)
    .map((s) => s.trim().replace(/^[-*|#\s]+/, ""))
    .filter((s) => s.length > 10);
}

/**
 * Finds the most relevant statement in a text containing specific terms
 */
function findRelevantSnippet(statements: string[], terms: string[]): string | undefined {
  if (statements.length === 0 || terms.length === 0) return undefined;
  
  for (const statement of statements) {
    const lower = statement.toLowerCase();
    for (const term of terms) {
      if (lower.includes(term.toLowerCase())) {
        return statement.length > 180 ? statement.slice(0, 180) + "..." : statement;
      }
    }
  }
  return statements[0] ? (statements[0].length > 180 ? statements[0].slice(0, 180) + "..." : statements[0]) : undefined;
}

/**
 * Generates a persistent WorkspaceReview object by comparing the newly imported material
 * and its extracted representation against the user's existing knowledge concepts.
 *
 * Strict Principles (Sprint 6):
 * 1. Operates solely from user-provided material and existing user workspace knowledge.
 * 2. Never fabricates relationships or fake placeholder concepts.
 * 3. Never uses vague labels ("Looks similar", "Probably related", "High yield", "Best match").
 * 4. Never ranks candidates as "best", "better", or "worse".
 * 5. Identifies the part of new material that appears related, the existing knowledge, and source materials.
 * 6. Supports multiple source materials per concept.
 * 7. Leaves decisions strictly to the user (no silent merging or auto-deciding).
 */
export function generateWorkspaceReview(
  material: Material,
  extraction: MaterialExtraction | null,
  existingConcepts: Concept[],
  allMaterials?: Material[]
): WorkspaceReview {
  const reviewId = `rev_${material.id}_${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Gather all textual streams from extraction for knowledge comparison
  const extractedText = extraction?.extractedText || material.originalInput?.rawContent || "";
  const headings = extraction?.documentStructure?.headings || [];
  const ocrText = extraction?.ocrResult?.text || "";
  const transcriptText = extraction?.transcriptResult?.text || "";
  const webTitle = extraction?.webResult?.pageTitle || "";
  const webText = extraction?.webResult?.pageText || "";

  // Collect table cell texts if available
  const tableCellsText = extraction?.ocrResult?.tables
    ? extraction.ocrResult.tables
        .flatMap((t) => [
          ...t.headers,
          ...t.rows.flatMap((r) => r.cells.map((c) => c.text)),
        ])
        .join(" ")
    : "";

  const combinedExtractedCorpus = [
    material.title,
    extractedText,
    headings.join(" "),
    ocrText,
    tableCellsText,
    transcriptText,
    webTitle,
    webText,
  ].join(" ");

  const lowerNewCorpus = combinedExtractedCorpus.toLowerCase();
  const newDomainTerms = extractDomainTerms(combinedExtractedCorpus);
  const newStatements = splitIntoStatements(combinedExtractedCorpus);

  // 2. Identify candidate concepts by genuine factual overlap
  const candidateConcepts: CandidateConcept[] = [];
  const proposedRelationships: ProposedRelationship[] = [];

  for (const concept of existingConcepts) {
    const conceptCorpus = [
      concept.title,
      concept.summary,
      concept.content,
      ...concept.tags,
    ].join(" ");

    const lowerConceptTitle = concept.title.toLowerCase().trim();
    const conceptDomainTerms = extractDomainTerms(conceptCorpus);
    const conceptStatements = splitIntoStatements(conceptCorpus);

    // Factual check A: Exact or near-exact concept title match
    const titleMatch = lowerConceptTitle.length >= 3 && (
      lowerNewCorpus.includes(lowerConceptTitle) ||
      headings.some((h) => h.toLowerCase().includes(lowerConceptTitle)) ||
      (tableCellsText && tableCellsText.toLowerCase().includes(lowerConceptTitle))
    );

    // Factual check B: Multi-word or tag intersection
    const matchingTags = concept.tags.filter(
      (t) => t.length > 2 && lowerNewCorpus.includes(t.toLowerCase())
    );

    // Factual check C: Domain terms intersection
    const matchingTerms = newDomainTerms.filter((term) =>
      conceptDomainTerms.includes(term)
    );

    // Only surface as candidate if there is substantive factual overlap
    const isSubstantiveOverlap = titleMatch || matchingTags.length >= 1 || matchingTerms.length >= 2;

    if (isSubstantiveOverlap) {
      // Collect shared factual terms (clean, de-duplicated)
      const salientTerms: string[] = [];
      if (titleMatch) salientTerms.push(concept.title);
      matchingTags.forEach((t) => salientTerms.push(t));
      matchingTerms.slice(0, 5).forEach((t) => {
        if (!salientTerms.some((st) => st.toLowerCase() === t.toLowerCase())) {
          salientTerms.push(t);
        }
      });

      // Extract grounded snippet from new material
      const newSnippet = findRelevantSnippet(newStatements, salientTerms) || 
        (extractedText ? extractedText.slice(0, 160).trim() + "..." : material.title);

      // Extract grounded snippet from existing concept
      const existingSnippet = findRelevantSnippet(conceptStatements, salientTerms) || 
        (concept.summary ? concept.summary : concept.content.slice(0, 160).trim() + "...");

      // Sprint 6 (Requirement 8): Remove artificial contradiction generation.
      // Do not synthesize false conflicts or "contradicts" relationships based on arbitrary keywords.
      const hasConflict = false;
      const conflictDescription = undefined;

      // Factual grounded rationale (strictly no vague labels or rankings)
      let similarityRationale = "";
      if (titleMatch) {
        similarityRationale = `Both the new material and concept '${concept.title}' explicitly reference "${concept.title}".`;
      } else if (matchingTags.length > 0) {
        similarityRationale = `Both the new material and concept '${concept.title}' share established domain topics: ${matchingTags.join(", ")}.`;
      } else {
        similarityRationale = `Both items address common subject terminology (${salientTerms.slice(0, 4).join(", ")}).`;
      }

      // Source-level tracking: associate all existing sources for this concept individually
      const sourceMaterials: CandidateSourceMaterial[] = [];
      if (concept.sourceMaterialIds && concept.sourceMaterialIds.length > 0 && allMaterials) {
        for (const sId of concept.sourceMaterialIds) {
          const src = allMaterials.find((m) => m.id === sId);
          if (src) {
            sourceMaterials.push({
              id: src.id,
              title: src.title,
              type: src.type,
              snippet: src.originalInput?.rawContent ? src.originalInput.rawContent.slice(0, 140).trim() + "..." : undefined,
            });
          }
        }
      }

      candidateConcepts.push({
        conceptId: concept.id,
        conceptTitle: concept.title,
        conceptSummary: concept.summary,
        existingContent: concept.content,
        version: concept.currentVersion,
        similarityRationale,
        relatedNewContentSnippet: newSnippet,
        relatedExistingContentSnippet: existingSnippet,
        sourceMaterials,
        overlappingTerms: salientTerms,
        hasConflict,
        conflictDescription,
      });

      // Relationships must not be automatically created during processing or review.
      // Relationships are only established when explicitly added by the user or confirmed in decisions.
    }
  }

  // 3. Formulate Proposed Changes based on findings
  let proposedChanges: ProposedChange;

  if (candidateConcepts.length > 0) {
    const primaryCandidate = candidateConcepts[0];
    const synthesizedContent = buildSynthesizedDraft(
      primaryCandidate.existingContent,
      material.title,
      extractedText || "No body text extracted.",
      headings
    );

    proposedChanges = {
      changeType: "merge_into_existing",
      targetConceptId: primaryCandidate.conceptId,
      suggestedTitle: primaryCandidate.conceptTitle,
      suggestedSummary: primaryCandidate.conceptSummary
        ? `${primaryCandidate.conceptSummary} (Expanded with material from "${material.title}")`
        : `Expanded knowledge incorporating "${material.title}".`,
      suggestedContent: synthesizedContent,
      rationale: "This material appears to overlap with existing knowledge.",
    };
  } else {
    // Zero candidates: genuine absence of overlap
    const cleanContent = extractedText ? extractedText.trim() : "";

    proposedChanges = {
      changeType: "create_new_concept",
      suggestedTitle: material.title,
      suggestedSummary: extractedText
        ? extractedText.slice(0, 180).trim() + (extractedText.length > 180 ? "..." : "")
        : "",
      suggestedContent: cleanContent,
      rationale: "No related knowledge found.",
    };
  }

  return {
    id: reviewId,
    userId: material.userId,
    workspaceId: material.workspaceId,
    materialId: material.id,
    materialTitle: material.title,
    materialType: material.type,
    extractionId: extraction?.id || `ext_unprocessed_${material.id}`,
    status: "pending",
    candidateConcepts,
    proposedRelationships,
    proposedChanges,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds a proposed markdown draft combining existing concept content and newly extracted material
 */
function buildSynthesizedDraft(
  existingContent: string,
  materialTitle: string,
  extractedText: string,
  headings: string[]
): string {
  const cleanNewText = extractedText.trim();
  const sectionHeader = `\n\n## Additions from: ${materialTitle}\n`;

  let additions = cleanNewText;
  if (headings.length > 0) {
    additions = `*Structure extracted from material:*\n${headings.map((h) => `- **${h}**`).join("\n")}\n\n${cleanNewText}`;
  }

  return `${existingContent.trim()}${sectionHeader}\n${additions}`;
}
