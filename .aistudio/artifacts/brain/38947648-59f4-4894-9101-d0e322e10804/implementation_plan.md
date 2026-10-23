# Sprint 8K Implementation Plan

## Objective
Audit and fix the complete flow from a user's final decision in Workspace Review to the resulting accepted knowledge.

## Scope
- Workspace Review, Material extraction, Keep Separate, Merge, Concept versioning, Relationship handling.

## Key Actions
1. **Relationship Integrity Repair**:
   - Refactor `executeReviewDecision` in `src/engines/review-engine/decision-handler.ts` to prevent duplicate relationship creation on decision retry.
   - Use deterministic IDs for relationships based on `sourceConceptId`, `targetConceptId`, and `reviewId`.
   - Before saving relationships, check if a relationship already exists with the same unique keys.

2. **Persistence & Consistency Audit**:
   - Verify `sourceMaterialIds` in `Concept` entities during merge operations.
   - Ensure `WorkspaceReview` status is correctly updated and persisted after a decision is made.

3. **Verification**:
   - Perform tests A-I as defined in the request.
   - Verify that re-running a decision (e.g., retrying a merge) does not produce duplicate entries in the database.
   - Verify that deleting a source material does not leave broken references (need to audit how references are cleaned up, if at all).

## Verification Plan
- [ ] Test A: Keep Separate with extracted text
- [ ] Test B: Keep Separate with OCR text
- [ ] Test C: Keep Separate with failed extraction
- [ ] Test D: Merge into one existing concept
- [ ] Test E: Merge into multiple selected concepts
- [ ] Test F: Retry a completed decision
- [ ] Test G: Edit accepted knowledge and reopen
- [ ] Test H: Delete a source that contributes to a merged concept
- [ ] Test I: Inspect relationships for duplicates and false contradictions
