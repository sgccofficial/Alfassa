export type ID = string;

export interface BaseEntity {
  id: ID;
  createdAt: string;
  updatedAt: string;
}

export interface User extends BaseEntity {
  email: string;
  displayName?: string;
  photoURL?: string;
}

export type MaterialType = 'document' | 'image' | 'video' | 'audio' | 'link' | 'text' | 'file';

export type MaterialSourceType = 'upload' | 'paste' | 'link' | 'recording';

export type MaterialStatus = 'saving' | 'uploading' | 'upload_complete' | 'raw' | 'intake_completed' | 'processing_failed';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'partially_completed' | 'failed';

export interface UploadProgressInfo {
  loaded: number;
  total: number;
  percentage?: number;
  state: 'saving' | 'uploading' | 'complete' | 'failed';
  error?: string;
}

export interface MaterialErrorDetail {
  stage: 'saving' | 'retrieval' | 'extraction';
  message: string;
  timestamp: string;
}

export interface MaterialOriginalInput {
  sourceType: MaterialSourceType;
  rawContent?: string; // Text content, markdown, pasted raw string, or URL
  url?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  dataUrl?: string; // Base64 data preview or inline storage when applicable
  blobStorageKey?: string; // IndexedDB storage key for arbitrary-sized original binaries
}

export interface MaterialMetadata {
  mimeType?: string;
  size?: number;
  extension?: string;
  recordedDuration?: number; // duration in seconds for audio
  origin?: string; // e.g. "drag-and-drop", "clipboard-paste", "file-picker", "direct-url"
  clientTimestamp?: string;
  storageEngine?: 'indexed_db' | 'inline' | 'url';
}

export interface MaterialPipeline {
  stage: 'ready_for_review' | 'intake';
  reviewPending: boolean;
}

export interface Material extends BaseEntity {
  userId: string;
  workspaceId: string;
  title: string;
  type: MaterialType;
  originalInput: MaterialOriginalInput;
  metadata: MaterialMetadata;
  status: MaterialStatus;
  processingStatus?: ProcessingStatus;
  pipeline: MaterialPipeline;
  uploadProgress?: UploadProgressInfo;
  errorDetail?: MaterialErrorDetail;
}

export type ExtractionPathway = 
  | 'plain_text' 
  | 'document_parser' 
  | 'ocr' 
  | 'audio_transcription' 
  | 'video_pipeline' 
  | 'web_extractor' 
  | 'generic_file';

export interface DocumentSection {
  title?: string;
  content: string;
  pageNumber?: number;
}

export interface ExtractedDocumentStructure {
  headings?: string[];
  paragraphs?: string[];
  sections?: DocumentSection[];
  pageCount?: number;
  slideCount?: number;
  wordCount?: number;
  characterCount?: number;
  tablesCount?: number;
  detectedFormat?: string; // e.g. "PDF (Text Stream)", "DOCX (WordprocessingML)", "PPTX (PresentationML)", "Markdown"
}

export interface ExtractedTableCell {
  text: string;
  lines: string[];
  colSpan?: number;
  rowSpan?: number;
}

export interface ExtractedTableRow {
  cells: ExtractedTableCell[];
  isHeader?: boolean;
}

export interface ExtractedTable {
  headers: string[];
  rows: ExtractedTableRow[];
  title?: string;
}

export interface ExtractedOcrResult {
  text: string;
  confidence?: number;
  orientation?: string;
  language?: string;
  hasText?: boolean;
  detectedDimensions?: { width: number; height: number };
  detectedBlocksCount?: number;
  tables?: ExtractedTable[];
}

export interface ExtractedTranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface ExtractedTranscriptResult {
  text: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  segments?: ExtractedTranscriptSegment[];
  language?: string;
  speakerCount?: number;
}

export interface ExtractedWebResult {
  canonicalUrl: string;
  domain?: string;
  pageTitle?: string;
  pageText?: string;
  metaDescription?: string;
  extractedAt: string;
  contentType?: string;
  fetchStatus?: 'retrieved' | 'cors_restricted_client' | 'failed';
}

export interface MaterialExtraction extends BaseEntity {
  materialId: string; // Foreign key strictly linking to original Material (id)
  userId: string;
  workspaceId: string;
  materialType: MaterialType;
  processingStatus: ProcessingStatus;
  pathwayUsed: ExtractionPathway;
  
  // Extracted Representations (always stored separate from original Material)
  extractedText?: string;
  documentStructure?: ExtractedDocumentStructure;
  ocrResult?: ExtractedOcrResult;
  transcriptResult?: ExtractedTranscriptResult;
  webResult?: ExtractedWebResult;
  
  // Technical Diagnostics & Failure Information
  error?: {
    code: string;
    message: string;
    details?: string;
    timestamp: string;
  };
  
  completedAt?: string;
}

export interface Activity {
  id: ID;
  userId: string;
  workspaceId: string;
  type: 'material_intake' | 'concept_created' | 'review_completed';
  action: 'created' | 'updated' | 'deleted';
  entityId: string;
  entityType: 'material' | 'concept' | 'workspace';
  description: string;
  metadata?: {
    materialType?: MaterialType;
    title?: string;
    size?: number;
    sourceType?: MaterialSourceType;
    [key: string]: any;
  };
  createdAt: string;
}

// -------------------------------------------------------------
// SPRINT 3: WORKSPACE REVIEW & ACCEPTED KNOWLEDGE FOUNDATION
// -------------------------------------------------------------

export type ReviewStatus = 'pending' | 'in_review' | 'resolved';

export type KnowledgeRelationType = 
  | 'relates_to' 
  | 'part_of' 
  | 'prerequisite_for' 
  | 'extends' 
  | 'contradicts';

export interface Concept extends BaseEntity {
  userId: string;
  workspaceId: string;
  title: string;
  summary: string;
  content: string;
  currentVersion: number;
  tags: string[];
  sourceMaterialIds: string[];
}

export interface ConceptVersion {
  id: ID;
  conceptId: string;
  version: number;
  userId: string;
  title: string;
  summary: string;
  content: string;
  changeReason: string;
  sourceMaterialId?: string;
  reviewId?: string;
  createdAt: string;
}

export interface KnowledgeRelationship extends BaseEntity {
  userId: string;
  workspaceId: string;
  sourceConceptId: string;
  targetConceptId: string;
  sourceTitle?: string;
  targetTitle?: string;
  relationType: KnowledgeRelationType;
  description?: string;
  isUserConfirmed: boolean;
  sourceMaterialId?: string;
  reviewId?: string;
}

export interface ProposedRelationship {
  id: string; // Unique identifier in the review scope e.g. "prop_rel_1"
  sourceTitle: string; // Extracted topic or candidate concept title
  targetConceptId?: string; // ID of existing concept if connecting to one
  targetTitle: string; // Target concept label
  relationType: KnowledgeRelationType;
  groundingSource: string; // Explicit citation from extracted material (e.g., "From section 'Optical Elements' p. 2")
  isEditable: boolean;
}

export interface CandidateSourceMaterial {
  id: string;
  title: string;
  type: MaterialType;
  snippet?: string;
}

export interface CandidateConcept {
  conceptId: string;
  conceptTitle: string;
  conceptSummary: string;
  existingContent: string;
  version: number;
  similarityRationale: string;
  relatedNewContentSnippet?: string;
  relatedExistingContentSnippet?: string;
  sourceMaterials?: CandidateSourceMaterial[];
  overlappingTerms?: string[];
  hasConflict?: boolean;
  conflictDescription?: string;
}

export interface ProposedChange {
  changeType: 'create_new_concept' | 'merge_into_existing' | 'update_existing';
  targetConceptId?: string;
  suggestedTitle: string;
  suggestedSummary: string;
  suggestedContent: string;
  rationale: string;
}

export interface UserDecisionRecord {
  action: 'merged' | 'kept_separate' | 'reviewed';
  decidedAt: string;
  targetConceptId?: string;
  targetConceptIds?: string[];
  resultingConceptId: string;
  resultingConceptVersion: number;
  finalTitle: string;
  finalSummary: string;
  finalContent: string;
  finalRelationships: Array<{
    targetConceptId?: string;
    targetTitle: string;
    relationType: KnowledgeRelationType;
    notes?: string;
  }>;
  notes?: string;
  extractedVersionSnapshot: {
    extractionId: string;
    pathwayUsed: string;
    completedAt?: string;
  };
}

export interface WorkspaceReview extends BaseEntity {
  userId: string;
  workspaceId: string;
  materialId: string;
  materialTitle: string;
  materialType: MaterialType;
  extractionId: string;
  status: ReviewStatus;
  candidateConcepts: CandidateConcept[];
  proposedRelationships: ProposedRelationship[];
  proposedChanges: ProposedChange;
  userDecision?: UserDecisionRecord;
  decisionHistory?: UserDecisionRecord[];
  resolvedAt?: string;
}

