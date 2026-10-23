# Alfassa - Architecture & Data Model (Sprint 0A)

This document outlines the foundational architecture, folder structure, and comprehensive entity relationship model for Alfassa, prior to any code implementation.

## 1. Architectural Philosophy

*   **Database First:** All features begin with data modeling. Schema dictates services, which dictate logic, which dictates UI.
*   **Engine-Driven:** Core business logic is abstracted into isolated "Engines" that handle specific domains (Material, Concept, Search, etc.) independently of the UI.
*   **Feature Modularity:** UI and feature-specific logic are grouped by domain to ensure scalability.
*   **Progressive Enhancement:** AI and complex processing are treated as asynchronous enhancements (e.g., Workspace Review) rather than blocking operations.

## 2. Global Folder Structure

```text
src/
├── app/                  # Routing, layouts, and top-level page components
├── assets/               # Static assets (images, icons, fonts)
├── engines/              # Core domain business logic and processors
│   ├── ai-engine/        # Prompt management, API orchestration, rate limiting
│   ├── concept-engine/   # Concept extraction, lesson creation, history, editor
│   ├── graph-engine/     # Graph calculations, layout algorithms, pathfinding
│   ├── knowledge-engine/ # Relationship builder, health, merge logic, conflict detection, integrity, evolution
│   ├── material-engine/  # Uploader, OCR, Parser, Importer, Workspace Review
│   ├── revision-engine/  # Spaced repetition algorithms, quiz generation
│   └── search-engine/    # Full-text search, semantic embedding search
├── features/             # Feature-specific UI, hooks, and local state
│   ├── activity/
│   ├── authentication/
│   ├── collections/
│   ├── concepts/
│   ├── explore/
│   ├── folders/
│   ├── graph/
│   ├── home/
│   ├── material/
│   ├── projects/
│   ├── revision/
│   ├── search/
│   └── settings/
├── services/             # External service integrations (Firebase, Stripe, etc.)
├── shared/               # Reusable UI components (buttons, cards), global hooks, utils
└── types/                # Global TypeScript interfaces, enums, and Zod schemas
```

## 3. Naming Conventions

*   **Files & Directories:** `kebab-case` (e.g., `material-engine`, `user-profile.tsx`).
*   **React Components:** `PascalCase` (e.g., `MaterialCard`, `WorkspaceReview`).
*   **Interfaces/Types:** `PascalCase` without `I` prefix (e.g., `User`, `Concept`).
*   **Variables/Functions:** `camelCase` (e.g., `fetchMaterials`, `isLoaded`).
*   **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_UPLOAD_SIZE`).
*   **Database Collections:** `camelCase`, pluralized (e.g., `materials`, `conceptVersions`).

## 4. Stable ID System

Never rely on document names. Everything must have an immutable ID with a stable prefix. The display name can change, but the ID never changes. Examples:

*   **`usr_...`** (User)
*   **`mat_...`** (Material)
*   **`con_...`** (Concept)
*   **`prj_...`** (Project)
*   **`fld_...`** (Folder)
*   **`col_...`** (Collection)
*   **`blk_...`** (Block)
*   **`grf_...`** (Graph)
*   **`rev_...`** (Revision)
*   **`auto_...`** (Automation)

## 5. Comprehensive Data Model (Firestore)

This model defines the entities for the entire application, including future features, to ensure the foundation can support long-term growth.

### Identity & Preferences
*   **`users`**: Core user account details.
*   **`workspaces`**: A user's environment (supports multiple workspaces per user in the future).
*   **`workspaceLayouts`**: Saved configurations/views of the workspace.
*   **`workspaceLayoutVersions`**: Immutable history of workspace layouts.
*   **`settings`**: User-specific preferences.
*   **`themes`**: Custom UI configurations.

### Core Knowledge Entities
*   **`materials`**: Raw inputs (documents, links, images, text). The source of truth.
*   **`materialVersions`**: Immutable history of material edits.
*   **`concepts`**: Extracted knowledge nodes, atomic ideas.
*   **`conceptVersions`**: Immutable history of concept edits.
*   **`lessons`**: Sequential or structured groupings of concepts.
*   **`blocks`**: Granular pieces of content (paragraphs, images, code) making up a Material or Concept.
*   **`sources`**: Metadata regarding the origin of a Material (URL, author, book title).
*   **`connections`**: Edges linking Concepts to Concepts, or Materials to Concepts.

### Organization & Hierarchy
*   **`folders`**: Traditional hierarchical organization.
*   **`collections`**: Thematic, curated lists of Materials or Concepts.
*   **`collectionVersions`**: Immutable history of collections.
*   **`projects`**: Goal-oriented groupings with states (e.g., active, archived).
*   **`projectVersions`**: Immutable history of projects.
*   **`tags`**: Flat, global labeling system.
*   **`bookmarks`**: Saved references for quick access.
*   **`favorites`**: Starred or highly important items.
*   **`pinnedItems`**: Items explicitly pinned to the dashboard or workspace.

### Processing & AI
*   **`aiReviews`**: The output of the "Workspace Review" process (insights, suggested concepts, duplicates).
*   **`ocrResults`**: Extracted text from images or PDFs.
*   **`transcripts`**: Extracted text from audio or video.
*   **`importJobs`**: Asynchronous tracking for bulk imports.
*   **`exportJobs`**: Asynchronous tracking for data exports.

### Learning & Spaced Repetition
*   **`revisions`**: Tracking data for spaced repetition (next review date, ease factor).
*   **`quizzes`**: Generated tests based on user concepts.
*   **`flashcards`**: Individual Q&A items linked to concepts.

### Graph & Visualization
*   **`graphNodes`**: Specialized state/positioning for items in the visual graph.
*   **`graphEdges`**: Specialized state/rendering data for connections in the visual graph.
*   **`graphVersions`**: Immutable history of the knowledge graph state.
*   **`timelines`**: Chronological ordering of events, concepts, or materials.

### System & Tracking
*   **`activities`**: Event logs for the user's activity feed (e.g., "Created concept X").
*   **`notifications`**: Alerts directed at the user.
*   **`automations`**: User-defined rules (e.g., "If tag X is added, move to folder Y").
*   **`automationVersions`**: Immutable history of automation rules.

## 6. Key Entity Relationships (Conceptual)

*   `User` (1) ─── (M) `Workspace`
*   `Workspace` (1) ─── (M) `Material`
*   `Workspace` (1) ─── (M) `Concept`
*   `Material` (1) ─── (M) `MaterialVersion`
*   `Concept` (1) ─── (M) `ConceptVersion`
*   `Material` (M) ─── (M) `Concept` (via `connections` collection)
*   `Concept` (M) ─── (M) `Concept` (via `connections` collection)
*   `Material` (1) ─── (1) `Source`
*   `Material` (1) ─── (1) `OCRResult` / `Transcript`
*   `Material` (1) ─── (M) `AIReview` (Workspace Review output)

---
*Status: Pending CTO Approval. Once approved, we will proceed to Sprint 0B: Project Setup.*
