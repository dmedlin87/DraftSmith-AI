# Test Coverage Plan (≥90%)

**Goal:** Every file in the Quill AI repo reaches **≥90% statements and lines coverage** (functions/branches as close as practical) using the latest coverage report you provided as the baseline.

This document is a **planning/checklist** only. It groups low-coverage files by subsystem and priority, and gives **LLM prompt templates** you can reuse when actually adding tests later.

---

## 1. Methodology

- Use the latest coverage report (the table you pasted) as the **source of truth**.
- A file is considered **weak** if **any** of: `% Stmts`, `% Lines`, `% Funcs`, `% Branch` is **< 90**.
- We work **by subsystem**, not one-off files, to reduce context switching:
  - Data & Intelligence backbone
  - Memory system
  - AppBrain & Agent & Commands
  - Editor/layout/settings hooks & UI
  - Feature UI (lore/project/agent) & Voice
  - Shared utils & test infra
- For each subsystem:
  - List important weak files (from your report).
  - Note **test themes** (what to exercise).
  - Provide a **prompt template** you can reuse with an LLM to draft tests.

When you rerun coverage, come back here and tick off files/groups that crossed 90%.

---

## 2. Priority Overview

### 2.1 P0 – Critical / Very Low Coverage

These are central to correctness and refactoring safety.

- **Data & Intelligence backbone**
  - `services/db.ts` (0%)
  - `services/intelligence/cache.ts`
  - `services/intelligence/chunkIndex.ts`
  - `services/intelligence/chunkManager.ts`
  - `services/intelligence/contradictionDetector.ts`
  - `services/intelligence/deltaTracker.ts`
  - `services/intelligence/incrementalProcessor.ts`
  - `services/intelligence/narrativeArc.ts`
  - `services/intelligence/sceneEmbedder.ts`
  - `services/intelligence/timelineTracker.ts`
  - `services/intelligence/workerPool.ts`
  - `services/intelligence/index.ts` (significant gaps)

- **Memory system**
  - `services/memory/autoObserver.ts`
  - `services/memory/cache.ts`
  - `services/memory/chains.ts`
  - `services/memory/factExtractor.ts`
  - `services/memory/goalGraph.ts`
  - `services/memory/index.ts`
  - `services/memory/realtimeTriggers.ts`
  - `services/memory/semanticDedup.ts`
  - `services/memory/sessionTracker.ts`

- **Agent / AppBrain / Commands (core infra)**
  - `features/core/context/AppBrainContext.tsx`
  - `services/appBrain/adaptiveContext.ts`
  - `services/appBrain/contextStreamer.ts`
  - `services/appBrain/crossChapterContext.ts`
  - `services/commands/analysis.ts`
  - `services/commands/editing.ts`
  - `services/commands/generation.ts`
  - `services/commands/knowledge.ts`
  - `services/commands/navigation.ts`
  - `services/commands/ui.ts`
  - `services/commands/registry.ts` (wiring)
  - `services/core/AgentController.ts`
  - `services/gemini/agent.ts`
  - `services/gemini/toolExecutor.ts`
  - Intelligence hook: `features/shared/hooks/useManuscriptIntelligence.ts`

---

### 2.2 P1 – Important / Moderate Coverage (50–89%)

- **Agent hooks & supporting contexts**
  - `features/agent/hooks/useAgentService.ts`
  - `features/agent/hooks/useAgentOrchestrator.ts`
  - `features/agent/hooks/useMemoryIntelligence.ts`
  - `features/agent/hooks/useProactiveSuggestions.ts`
  - `features/intelligence/index.ts` gaps

- **Editor hooks & layout store**
  - `features/editor/hooks/useChunkIndex.ts`
  - `features/editor/hooks/useTiptapSync.ts`
  - `features/editor/hooks/useEditorBranching.ts`
  - `features/layout/EditorLayout.tsx`
  - `features/layout/MainLayout.tsx` (branch gaps only)
  - `features/layout/store/useLayoutStore.ts`

- **Settings & shared hooks**
  - `features/settings/components/CritiqueIntensitySelector.tsx`
  - `features/settings/components/ExperienceSelector.tsx`
  - `features/shared/hooks/useDraftSmithEngine.ts`
  - `features/shared/hooks/useViewportCollision.ts`
  - `features/shared/context/UsageContext.tsx`

- **Lore/project/agent UI & voice hooks**
  - `features/lore/components/KnowledgeGraph.tsx`
  - `features/lore/components/LoreManager.tsx`
  - `features/project/components/ImportWizard.tsx`
  - `features/project/components/ProjectDashboard.tsx`
  - `features/agent/components/ChatInterface.tsx`
  - `features/agent/components/ActivityFeed.tsx`
  - `features/voice/hooks/useAudioController.ts`
  - `features/voice/hooks/useTextToSpeech.ts`
  - `features/voice/hooks/useVoiceSession.ts`

---

### 2.3 P2 – Near-Threshold (80–89%) / Final Polish

Mostly small branch/edge-case gaps.

- `App.tsx`
- `config/models.ts`
- Various editor components: `EditorWorkspace.tsx`, `FindReplaceModal.tsx`, `MagicBar.tsx`, `RichTextEditor.tsx`, `VersionControlPanel.tsx`, etc.
- Shared components: `AccessibleTooltip.tsx`, `Icons.tsx`
- Utils: `features/shared/utils/textLocator.ts`
- Test helpers: `tests/mocks/geminiClient.ts`, `tests/factories/analysisResultFactory.ts`

These are best handled **after** P0/P1, when you’re doing a final 90% push.

---

## 3. Subsystem Plans & Prompt Templates

Below: short notes + **reusable prompts**. When you’re ready to implement, copy a prompt, fill in the file names, and let the LLM draft tests which you then refine.

### 3.1 Data & Intelligence Backbone (P0)

**Key files:** `services/db.ts`, `services/intelligence/*` (cache, chunkIndex, chunkManager, contradictionDetector, deltaTracker, incrementalProcessor, narrativeArc, sceneEmbedder, timelineTracker, workerPool, index).

**Test themes:**

- Deterministic parsing and analysis for small synthetic manuscripts.
- Cache semantics (hits/misses, TTL, LRU eviction).
- Incremental and delta-based processing.
- Worker/workerPool scheduling, cancellation, and error propagation.
- Edge cases: empty text, huge text, odd formatting.

**Prompt template:**

```text
You are writing Vitest tests for the data & intelligence backbone in the Quill AI repo.

Target files:
{{file_list}}

Goal: raise each file to at least 90% statements and lines coverage.

1. Open each file and identify:
   - Exported functions/classes (public API).
   - Any configuration constants/thresholds.
2. For each file, add tests that:
   - Cover a normal "happy path" with a small manuscript snippet.
   - Exercise at least one edge case (empty input, very long text, weird punctuation).
   - Hit all meaningful branches (thresholds, cache hit vs miss, error paths).
   - For worker/async code, use mocks so tests stay deterministic.
3. Follow existing style in `tests/services/intelligence/*.test.ts`.

Return only the Vitest tests.
```

---

### 3.2 Memory System (P0)

**Key files:** `services/memory/autoObserver.ts`, `cache.ts`, `chains.ts`, `factExtractor.ts`, `goalGraph.ts`, `index.ts`, `realtimeTriggers.ts`, `semanticDedup.ts`, `sessionTracker.ts`.

**Test themes:**

- Translating analysis/intelligence results into MemoryNotes and AgentGoals.
- Deduplication of near-duplicate notes; importance scoring and tags.
- Goal relationships and session tracking (active/stalled goals).
- Trigger generation for proactive suggestions and reminders.

**Prompt template:**

```text
You are writing Vitest tests for the memory subsystem in the Quill AI repo.

Target files:
{{file_list}}

Goal: reach ≥90% coverage while validating the agent memory behavior.

Design tests that:
- Feed in small, realistic analysis/intelligence result objects.
- Assert on the MemoryNotes, AgentGoals, and triggers produced.
- Cover deduplication logic and edge cases (empty inputs, conflicting notes).
- Verify that public APIs in `services/memory/index.ts` correctly wire to helpers.

Use simple in-memory fixtures; avoid real IndexedDB, and mock `services/db.ts` if needed.
```

---

### 3.3 AppBrain, Commands, Agent Orchestration (P0/P1)

**Key files:**

- AppBrain/context: `features/core/context/AppBrainContext.tsx`, `services/appBrain/*.ts`.
- Commands: `services/commands/*.ts` (analysis, editing, generation, knowledge, navigation, ui, registry).
- Agent orchestration: `services/core/AgentController.ts`, `services/gemini/agent.ts`, `services/gemini/toolExecutor.ts`, `services/gemini/memoryToolHandlers.ts`, `services/gemini/errors.ts`.
- Hooks: `features/agent/hooks/useAgentService.ts`, `useAgentOrchestrator.ts`, `useMemoryIntelligence.ts`, `useProactiveSuggestions.ts`.

**Test themes:**

- AppBrain context building (full vs compressed context, cross-chapter, adaptive behavior).
- Commands correctly delegating to services and honoring undo/reversible semantics.
- Agent flows: user request → LLM prompt → tool execution → final response.
- Error handling and retries, memory tool routing, CommandHistory integration.

**Prompt template:**

```text
You are writing Vitest tests for the AppBrain + command + agent orchestration layer in the Quill AI repo.

Target files:
{{file_list}}

Goal: raise coverage for these files to ≥90% and lock in the intended agent behavior.

For each area:
- AppBrain/context: build small AppBrainState fixtures and assert that context builders produce expected prompt fragments.
- Commands: mock underlying services; for each command, test execute() (and undo() if present), verifying the right calls are made.
- Agent orchestration: mock the Gemini client; cover a full happy-path interaction and at least one error path, asserting on state transitions and tool execution.

Use existing tests in `tests/services/core` and `tests/services/gemini` as style guides.
```

---

### 3.4 Editor/Layout/Settings Hooks & UI (P1)

**Key files:**

- Hooks: `features/editor/hooks/useChunkIndex.ts`, `useTiptapSync.ts`, `useEditorBranching.ts`.
- Layout: `features/layout/EditorHeader.tsx`, `EditorLayout.tsx`, `MainLayout.tsx`, `store/useLayoutStore.ts`.
- Settings: `features/settings/components/BudgetSelector.tsx`, `CritiqueIntensitySelector.tsx`, `ExperienceSelector.tsx`.

**Test themes:**

- For hooks, small harness components + React Testing Library.
- For layout, different UI states (zen mode, panels open/closed, responsive behavior).
- For settings, controlled components and callbacks (value changes, keyboard interactions).

**Prompt template:**

```text
You are writing React Testing Library + Vitest tests for editor/layout/settings hooks and components.

Target files:
{{file_list}}

Goal: bring each to ≥90% coverage.

Guidelines:
- For hooks, create a test component that exposes hook state and actions; render, interact, and assert on resulting state.
- For layout components, render them with mocked context/store and simulate user actions (clicks, keyboard shortcuts) that trigger different branches.
- For settings components, verify initial rendering, updates when props change, and onChange callbacks when users interact.

Match the style of existing tests under `tests/components` and `tests/features`.
```

---

### 3.5 Feature UI & Voice Hooks (P1/P2)

**Key files:**

- Lore: `KnowledgeGraph.tsx`, `LoreManager.tsx`.
- Project: `ImportWizard.tsx`, `ProjectDashboard.tsx`, `StoryBoard.tsx`.
- Agent UI: `ChatInterface.tsx`, `ActivityFeed.tsx`.
- Voice hooks: `useAudioController.ts`, `useTextToSpeech.ts`, `useVoiceSession.ts`.

**Test themes:**

- Multi-step flows (ImportWizard, StoryBoard interactions, Chat/Activity feed updates).
- Graph interactions (node clicks, hover states, navigation hooks for KnowledgeGraph).
- Voice: lifecycle of a voice session, error states, TTS start/stop, audio controller state changes.

**Prompt template:**

```text
You are writing tests for feature UI and voice hooks in the Quill AI repo.

Target files:
{{file_list}}

Goal: cover common user flows plus key edge cases to reach ≥90% coverage.

Instructions:
- For multi-step UIs (ImportWizard, StoryBoard), model realistic user flows: open → configure → confirm → complete; assert state and calls at each step.
- For ChatInterface and ActivityFeed, mock agent services and assert rendering of messages, loading states, and error displays.
- For voice hooks, mock the Web Audio / Web Speech APIs and assert correct state transitions for start/stop, error, and cleanup.
```

---

### 3.6 Shared Utils & Test Infra (P2)

**Key files:**

- `features/shared/utils/textLocator.ts`
- `features/shared/context/UsageContext.tsx`
- `features/shared/components/AccessibleTooltip.tsx`, `Icons.tsx`
- `tests/mocks/geminiClient.ts`, `tests/factories/analysisResultFactory.ts`

**Test themes:**

- Exhaustive but small input sets for textLocator (exact vs fuzzy matches, multiple hits, no hits).
- UsageContext state updates and edge cases.
- Tooltip timing/keyboard behavior and icon rendering fallbacks.
- Mocks and factories: verify they produce stable fixtures and support new fields.

**Prompt template:**

```text
You are writing final polish tests for shared utils and test helpers in the Quill AI repo.

Target files:
{{file_list}}

Goal: close the remaining gaps to ≥90% coverage.

Instructions:
- For textLocator and similar utils, design small, focused test cases that hit each branch.
- For context/components, test initialization, updates, and any conditional rendering.
- For mocks and factories, add tests that lock in expected shapes so future refactors don’t silently break them.
```

---

## 4. How to Use This Plan

1. Pick a **phase** (start with P0).
2. Copy the relevant **prompt template**, fill in `{{file_list}}` with the exact files from your coverage report.
3. Ask the LLM to draft tests; then:
   - Integrate them into `tests/` with small manual fixes.
   - Rerun coverage.
4. Update this document (or a checklist) to mark completed files/groups.

Once Phase 1–3 are done, a final sweep over P2 files should get you to your "every file ≥90%" goal.
