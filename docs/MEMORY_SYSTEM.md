# Memory System

The memory system gives the agent long-lived knowledge about each manuscript and the author.

It bridges:

- **Intelligence & analysis outputs** → structured `MemoryNote`s and `AgentGoal`s.
- **Dexie-backed tables** → efficient queries by project, scope, tags, and importance.
- **AppBrain context builders** → compact memory slices embedded into prompts.
- **Agent tools** → read/write operations exposed to the model (e.g. `write_memory_note`, `search_memory`).

Key code:

- `services/db.ts` — Dexie schema for `memories`, `goals`, `watchedEntities`.
- `services/memory/index.ts` — core memory service (CRUD + contextual retrieval helpers).
- `services/memory/autoObserver.ts` — creates memories from analysis/intelligence.
- `services/memory/sessionTracker.ts` — tracks memories created within the current chat session.
- `services/appBrain/contextBuilder.ts` & `services/appBrain/adaptiveContext.ts` — pull relevant memories/goals into prompts.
- `services/gemini/toolExecutor.ts` — routes memory tools to the memory service.

---

## 1. Storage Schema (Dexie)

Defined in `services/db.ts`:

```ts
export class QuillAIDB extends Dexie {
  projects!: Table<Project>;
  chapters!: Table<Chapter>;
  memories!: Table<MemoryNote>;
  goals!: Table<AgentGoal>;
  watchedEntities!: Table<WatchedEntity>;

  constructor() {
    super('QuillAIDB');

    // Version 1: projects + chapters
    (this as any).version(1).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt'
    });

    // Version 2: Agent Memory System
    (this as any).version(2).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt',
      memories: 'id, scope, projectId, type, [scope+projectId], *topicTags, importance, createdAt',
      goals: 'id, projectId, status, [projectId+status], createdAt',
      watchedEntities: 'id, projectId, priority'
    });
  }
}
```

**Tables:**

- **`memories`**
  - Stores `MemoryNote` records.  
  - Indexed by:
    - `scope` (`'project'` or `'author'`)
    - `projectId`
    - `type` (observation/issue/fact/plan/preference)
    - compound `[scope+projectId]`
    - multi-entry `*topicTags` for tag queries
    - `importance`, `createdAt` for ranking

- **`goals`**
  - Stores `AgentGoal` entries per project.  
  - Indexed by `projectId`, `status`, and `[projectId+status]`.

- **`watchedEntities`**
  - Stores `WatchedEntity` entries per project (characters or story elements the agent should proactively track).

---

## 2. Core Types

Defined in `services/memory/types.ts`.

### 2.1 MemoryNote

```ts
export type MemoryScope = 'project' | 'author';

export type MemoryNoteType = 'observation' | 'issue' | 'fact' | 'plan' | 'preference';

export interface MemoryNote {
  id: string;
  scope: MemoryScope;
  projectId?: string; // required when scope === 'project'
  text: string;
  type: MemoryNoteType;
  topicTags: string[];
  importance: number; // 0-1
  createdAt: number;
  updatedAt?: number;
}
```

- **Project-scoped** memories capture story-specific facts, issues, and observations.  
- **Author-scoped** memories capture preferences that apply across projects.

### 2.2 AgentGoal

```ts
export type GoalStatus = 'active' | 'completed' | 'abandoned';

export interface AgentGoal {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: GoalStatus;
  progress: number; // 0-100
  relatedNoteIds?: string[];
  createdAt: number;
  updatedAt?: number;
}
```

- Represents multi-step agent work (e.g. "tighten pacing in Act 2", "resolve character contradiction").  
- Linked to `MemoryNote`s via `relatedNoteIds`.

### 2.3 WatchedEntity

```ts
export interface WatchedEntity {
  id: string;       // e.g. 'character:sarah'
  name: string;     // display name
  projectId: string;
  priority: 'low' | 'medium' | 'high';
  reason?: string;
  monitoringEnabled?: boolean;
  createdAt: number;
}
```

- Drives proactive checks (e.g. character continuity, recurring motifs).

---

## 3. Memory Service (CRUD + Retrieval)

Defined primarily in `services/memory/index.ts`.

### 3.1 CRUD Operations

- **`createMemory(input: CreateMemoryNoteInput): Promise<MemoryNote>`**
  - Validates that `projectId` is present for `scope === 'project'`.
  - Fills in `id` and `createdAt` and inserts into `db.memories`.

- **`getMemories(params?: ListMemoryNotesParams): Promise<MemoryNote[]>`**
  - Optional filters: `scope`, `projectId`, `type`, `topicTags`, `minImportance`, `limit`.
  - Returns results sorted by **importance desc**, then **createdAt desc**.

- **`updateMemory(input: UpdateMemoryNoteInput & { id: string }): Promise<MemoryNote>`**
  - Updates an existing memory and bumps `updatedAt`.

- **`deleteMemory(id: string): Promise<void>`**
  - Removes a memory by ID.

### 3.2 Query & Formatting Helpers

These helpers are used heavily by AppBrain context builders and the agent tools:

- **`searchMemoriesByTags(tags: string[], options?: { projectId?: string; limit?: number }): Promise<MemoryNote[]>`**  
  - Tag-based lookup, with optional project scoping and result limiting.

- **`getMemoriesForContext(projectId: string, options?: { limit?: number }): Promise<{ author: MemoryNote[]; project: MemoryNote[] }>`**  
  - Fetches candidate **author** and **project** memories for inclusion in prompts.

- **`getRelevantMemoriesForContext(projectId: string, relevance?: MemoryRelevanceOptions, options?: { limit?: number }): Promise<{ author: MemoryNote[]; project: MemoryNote[] }>`**  
  - Filters project memories by active entities, selection keywords, and active chapter while always returning all author memories.

- **`getActiveGoals(projectId: string): Promise<AgentGoal[]>`**  
  - Returns goals with non-terminal statuses for the current project.

- **`formatMemoriesForPrompt(...)`**, **`formatGoalsForPrompt(...)`**  
  - Condense memories/goals into compact, ordered text blocks for inclusion in AI context.  
  - The memory formatter receives project memories **with the bedside-note planning memory already ordered first** (see §6.1).

These functions are imported from `services/appBrain/contextBuilder.ts` and `services/appBrain/adaptiveContext.ts` to construct the memory sections of the prompt.

---

## 4. Auto-Observation Layer

Defined in `services/memory/autoObserver.ts`.

**Goal:** Automatically create useful `MemoryNote`s from analysis and intelligence results, without requiring explicit tool calls every time.

Key pieces:

- **`observeAnalysisResults(analysis, options)`**
  - Scans `AnalysisResult` objects for important issues and observations.
  - Creates new memory notes for significant critiques, contradictions, and suggestions.
  - Uses `minImportance`, `maxObservations`, and `deduplicateEnabled` options to keep noise low.

- **`observeIntelligenceResults(intelligence, options)`**
  - Works on `ManuscriptIntelligence` (entities, timeline, structural analysis).
  - Extracts, for example:
    - Character relationship changes.
    - Open plot threads (`timeline.promises` that are unresolved).
  - Creates `MemoryNote`s with tags like `plot-thread`, `character-arc`, etc.

- **`observeAll(analysis, intelligence, options)`**
  - Convenience helper that runs both analysis and intelligence observers and returns a combined `ObservationResult`:
    - `created`: notes actually written.
    - `skipped`: deduplicated or filtered items.
    - `errors`: any failures when calling `createMemory`.

Duplicate detection can use existing memories (via `getMemories`) and tag/text similarity heuristics, so the system avoids repeatedly logging the same problem.

---

## 5. Session Memory Tracker

Defined in `services/memory/sessionTracker.ts`.

**Problem:** The initial system prompt snapshot may not reflect memories created later in the conversation.

**Solution:** Track memory activity **per chat session** and surface a short, fresh summary.

Key parts:

- **`SessionMemoryState`**
  - `created`: memories created this session.
  - `updated`: list of `{ id, changes }`.
  - `deleted`: array of deleted memory IDs.
  - `goalsCreated`: IDs of goals created this session.

- **Core APIs (examples):**
  - `trackSessionMemory(note: MemoryNote)` / `trackGoalCreated(id: string)`  
    - Called from memory tools when they succeed.
  - `getSessionMemorySummary(): string | null`  
    - Produces a compact, human-readable summary of recent session memories.
  - `enrichToolResponse(baseResponse: string, includeSessionSummary = true): string`  
    - Appends the session summary to tool responses, keeping the model and user aligned.
  - `clearSessionMemories()`  
    - Resets state when a chat session is reset.

This layer ensures that **newly created memories** are visible to the agent even if the main AppBrain context was built earlier.

---

## 6. Memory in AppBrain & Agent Context

The AppBrain context builders pull relevant memories and goals into the agent prompt.

### 6.1 Context Builder Integration

In `services/appBrain/contextBuilder.ts`:

- Imports memory helpers:
  - `getMemoriesForContext`
  - `getRelevantMemoriesForContext`
  - `getActiveGoals`
  - `formatMemoriesForPrompt`
  - `formatGoalsForPrompt`
- `buildAgentContext(...)` and `buildCompressedContext(...)` include sections such as:
  - `[MEMORY]` with recent/high-importance notes for the active project/selection.
  - `[GOALS]` with active goals relevant to the current work.

In `services/appBrain/adaptiveContext.ts`:

- **`buildAdaptiveContext(state, projectId, options)`**
  - Builds an overall context string within a **token budget** (`ContextBudget`).
  - Allocates a portion of tokens to **memory** and **history** sections.
  - Uses `TokenLimits` and model-aware budgets from `config/models.ts`.

- **`getContextBudgetForModel(...)`, `selectContextProfile(...)`**
  - Decide how much budget memory gets vs manuscript, analysis, etc., based on:
    - Model role (agent vs voice).
    - Mode (text vs voice).
    - Query type (editing / analysis / general).

- **`getSmartAgentContext(state, projectId, options)`**
  - The "one obvious way" to build agent context:  
    - Chooses a budget and profile.  
    - Computes relevance signals (active entities, selection keywords, active chapter).  
    - Calls `buildAdaptiveContext`, which pulls in **relevant** memories and goals.

- **Bedside-note planning memory (Phase 1)**
  - `buildAdaptiveContext` ensures that each project has a **single persistent planning note**:
    - Implemented as a `MemoryNote` with `type: 'plan'`, `scope: 'project'`, and `topicTags` including `meta:bedside-note`.
    - Created automatically the first time smart context is built for a project (if missing).
  - Before formatting, the memory section reorders project memories so that any bedside-note planning memory appears **first** in the project memory list.
  - This note acts as the project's "bedside note"—a short, evolving plan that Phase 2 builds on.

- **Bedside-note evolution (Phase 2, thin slice)**
  - The memory chains module (`services/memory/chains.ts`) exports helpers that specialize `evolveMemory` for bedside-note planning:
    - `getOrCreateBedsideNote(projectId)` — finds the existing bedside-note `MemoryNote` for the project (tagged `meta:bedside-note`) or creates it with default text if missing.
    - `evolveBedsideNote(projectId, newText, options?)` — uses `evolveMemory` to add a new version to the bedside-note chain, preserving the earlier versions and tagging changes with a `changeReason`.
  - Evolution is currently driven by three main flows:
    - **Analysis observation:** `useMemoryIntelligence` (in `features/agent/hooks/useMemoryIntelligence.ts`) calls `observeAnalysisResults`, then pulls `getActiveGoals(projectId)` and synthesizes a concise bedside-note update (story summary, top concerns, key plot issues, and active goals). It then calls `evolveBedsideNote(projectId, planText, { changeReason: 'analysis_update' })`.
    - **Proactive thinking:** `ProactiveThinker` (in `services/appBrain/proactiveThinker.ts`) runs in the background on AppBrain events (including `ANALYSIS_COMPLETED`). When the LLM reports a **significant** thinking result, it combines the top proactive suggestions with `getImportantReminders(projectId)` into a short plan and calls `evolveBedsideNote(projectId, planText, { changeReason: 'proactive_thinking' })`.
    - **Significant edit detection:** `SignificantEditMonitor` (in `services/appBrain/significantEditMonitor.ts`) listens to `TEXT_CHANGED` events. It accumulates absolute deltas with a short debounce (~300ms) and, when the cumulative change exceeds a threshold (default 500 chars) and the per-project cooldown (5 minutes) has elapsed, it evolves the bedside note with a warning plan text and `changeReason: 'significant_edit'`. This prevents analysis staleness after large edit bursts and includes anti-spam cooldown.
  - This creates an **Evolving Memory chain** for the bedside note over time, so the agent always has a compact, up-to-date planning summary that reflects recent analysis, goals, proactive reminders, and major edits while throttling spam via cooldown.

### 6.2 ToolExecutor Integration

In `services/gemini/toolExecutor.ts`:

- Memory tool names are collected in `MEMORY_TOOL_NAMES`:

  ```ts
  const MEMORY_TOOL_NAMES = new Set<string>([
    'write_memory_note',
    'search_memory',
    'update_memory_note',
    'delete_memory_note',
    'create_goal',
    'update_goal',
    'watch_entity',
  ]);
  ```

- **`executeMemoryToolCall(toolName, args, projectId)`** (internal helper):
  - Delegates to the appropriate memory service function.
  - Often uses `projectId` to scope notes/goals.

- **`executeAgentToolCall(toolName, args, actions, projectId)`**:
  - Routes memory tools to `executeMemoryToolCall`.
  - Routes all other tools to `executeAppBrainToolCall`.

This keeps memory operations logically separated but fully accessible to the agent.

---

## 7. Typical Memory Flows

### 7.1 Observation from Analysis

1. User runs an analysis (`run_analysis` tool or UI button).
2. Intelligence and analysis layers produce `AnalysisResult` and `ManuscriptIntelligence`.
3. `autoObserver.observeAll(analysis, intelligence, options)` runs:
   - Extracts important issues, contradictions, character arcs, open plot threads.
   - Uses `createMemory` to write `MemoryNote`s into Dexie.
4. On the next agent turn, `getSmartAgentContext` pulls these notes and includes them in the `[MEMORY]` section of the prompt.

### 7.2 Explicit Memory via Tools

1. Agent calls `write_memory_note` (for example, to remember an author preference like "prefers minimalist dialogue").
2. `toolExecutor` detects a memory tool and calls the corresponding function in `services/memory/index.ts`.
3. `sessionTracker` tracks the created note in `SessionMemoryState`.
4. `enrichToolResponse` can append a short summary such as:
   > [Session: 1 memory created]

5. Future context builds see the new preference when `scope === 'author'` or the project ID matches.

### 7.3 Proactive Monitoring

1. A user or tool adds a `WatchedEntity` (e.g. `character:sarah`, priority `high`).
2. Intelligence and observation layers take watched entities into account when scanning for contradictions or open threads.
3. Observed issues (e.g. "Sarah's eyes are blue here but green in Chapter 1") become `MemoryNote`s tagged with the entity.
4. The agent can later answer questions like:  
   > "Have we been consistent with Sarah's eye color?"

---

## 8. When to Touch the Memory System

You should consider using or extending the memory system when:

- You want the agent to **remember** something beyond the current turn.
- A feature relies on **cross-chapter consistency** or long-running goals.
- You need structured data (not just free-text context) to drive decisions.

When changing the memory system:

- Keep `services/db.ts` schema changes **backwards-compatible** (add a new version, don't break v1/v2).  
- Update any relevant docs:
  - This file (`MEMORY_SYSTEM.md`).
  - `APP_BRAIN_FLOW.md` if the flow changes.
  - `AGENT_ARCHITECTURE.md` if new tools or roles are introduced.
- Add tests around:
  - New CRUD helpers in `services/memory/index.ts`.
  - Any new auto-observation or session-tracking logic.

For a high-level view of how memory fits into the overall agent architecture, see:

- `docs/AGENT_ARCHITECTURE.md`
- `docs/APP_BRAIN_FLOW.md`
- `docs/ARCHITECTURE.md`

For the full roadmap of bedside-note planning memory development, see:

- `docs/BEDSIDE_NOTE_ROADMAP.md`
