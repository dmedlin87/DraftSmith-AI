# Bedside-Note Evolution Roadmap

This document outlines the phased development of Quill AI's **bedside-note planning memory**—a persistent, evolving note per project that helps the agent maintain long-term awareness of story goals, issues, and next steps.

The metaphor: a novelist's bedside notebook where they jot down "don't forget Sarah's eye color changed" or "next session: tighten Act 2 pacing" before sleep, then review it the next morning.

---

## Current State (Phases 1–2)

### Phase 1: Persistent Planning Memory ✅

**Goal:** Ensure every project has a single, persistent planning note that appears first in agent context.

**Implemented:**

- `MemoryNote` with `type: 'plan'`, `scope: 'project'`, tagged `meta:bedside-note`.
- Auto-created by `buildAdaptiveContext` if missing.
- Reordered to appear **first** in the `[AGENT MEMORY]` section.
- Shared constants: `BEDSIDE_NOTE_TAG`, `BEDSIDE_NOTE_DEFAULT_TAGS` in `services/memory/types.ts`.

**Key files:**

- `services/appBrain/adaptiveContext.ts` — creation and reordering logic.
- `services/memory/types.ts` — shared tag constants.

---

### Phase 2: Basic Evolution via Memory Chains ✅

**Goal:** Automatically update the bedside note when significant events occur, preserving history via memory chains.

**Implemented:**

- Chain helpers in `services/memory/chains.ts`:
  - `getOrCreateBedsideNote(projectId)` — find or create the bedside note.
  - `evolveBedsideNote(projectId, newText, { changeReason })` — create a new chain version.
- Evolution triggers:
  - **Analysis observation** (`useMemoryIntelligence.observeAnalysis`) — builds plan text from analysis summary, weaknesses, plot issues, and active goals.
  - **Proactive thinking** (`ProactiveThinker.forceThink`) — builds plan text from significant suggestions and important reminders.
- Each evolution creates a new `MemoryNote` in the chain with:
  - `chain:<chainId>` and `chain_version:<n>` tags.
  - `supersedes:<previousNoteId>` for lineage.
  - `change_reason:<reason>` for audit.

**Key files:**

- `services/memory/chains.ts` — chain creation and evolution.
- `features/agent/hooks/useMemoryIntelligence.ts` — analysis-driven evolution.
- `services/appBrain/proactiveThinker.ts` — proactive-thinking-driven evolution.

**Tests:**

- `tests/services/memory/chains.test.ts`
- `tests/features/agent/hooks/useMemoryIntelligence.test.ts`
- `tests/services/appBrain/proactiveThinker.test.ts`

---

## Near-Term Phases (3–5)

### Phase 3: Richer Evolution Triggers

**Goal:** Evolve the bedside note in response to more meaningful events beyond analysis and proactive thinking.

#### 3.1 Goal Lifecycle Events

**Trigger:** Goal creation, completion, or abandonment.

**Implementation:**

- In `services/memory/index.ts`, after `addGoal`, `completeGoal`, or `abandonGoal`:
  - Fetch current goals and bedside note.
  - Build a short plan update: "Goal added: X" or "Goal completed: Y — consider next steps."
  - Call `evolveBedsideNote(projectId, planText, { changeReason: 'goal_lifecycle' })`.

**Rationale:** Goal changes are high-signal events that should immediately reflect in the agent's planning context.

#### 3.2 Chapter Transitions

**Trigger:** User switches to a different chapter (`CHAPTER_CHANGED` event).

**Implementation:**

- In AppBrain event handling (or a dedicated observer):
  - On `CHAPTER_CHANGED`, check if the new chapter has open issues or watched entities.
  - If significant context shift, evolve bedside note with "Now in Chapter X — remember: [relevant issues]."
  - Use `changeReason: 'chapter_transition'`.

**Rationale:** Helps the agent "re-orient" when the user jumps around the manuscript.

#### 3.3 Session Boundaries

**Trigger:** Chat session start or end.

**Implementation:**

- On session start (detected via `sessionTracker` or orchestrator initialization):
  - Fetch the bedside note and present a "session briefing" to the agent.
  - Optionally evolve with "Session started — last time we discussed X."
- On session end (if detectable, e.g., explicit "end session" command or timeout):
  - Summarize session activity and evolve with "Session ended — key changes: Y."
  - Use `changeReason: 'session_boundary'`.

**Rationale:** Provides continuity across writing sessions, especially for users who work sporadically.

#### 3.4 Significant Text Changes ✅ (implemented)

**Trigger:** Large manuscript edits detected via `TEXT_CHANGED` events.

**Implementation (shipped):**

- `startAppBrainEventObserver` now subscribes to `TEXT_CHANGED` and forwards to the singleton `SignificantEditMonitor`.
- The monitor accumulates absolute deltas, debounced (300ms) to capture bursts, and fires only when cumulative delta ≥ 500 chars **and** a per-project cooldown (5 minutes) has elapsed.
- On trigger, it calls `evolveBedsideNote(projectId, planText, { changeReason: 'significant_edit' })` with a short warning: “Significant edits detected — analysis may be stale. Run analysis to refresh.”
- Anti-spam: cooldown prevents repeated evolutions inside the window.

**Rationale:** Large edits may invalidate previous analysis; the bedside note should flag this and prompt a refresh.

#### 3.5 Staleness Refresh

**Trigger:** Bedside note hasn't been updated in N hours/days.

**Implementation:**

- On smart context build, check `updatedAt` of bedside note.
- If stale, fetch latest analysis/goals and regenerate a fresh snapshot.
- Use `changeReason: 'staleness_refresh'`.

**Rationale:** Prevents the bedside note from drifting out of sync with the manuscript.

---

### Phase 4: Structured Bedside-Note Content

**Goal:** Move from free-form text to a structured, token-aware format with priority-based truncation.

#### 4.1 Structured Schema

Define a `BedsideNoteContent` interface:

```ts
interface BedsideNoteContent {
  currentFocus?: string;        // What the user is working on now
  openQuestions?: string[];     // Unresolved story questions
  activeGoals?: GoalSummary[];  // Top goals with progress
  recentDiscoveries?: string[]; // New facts or issues from analysis
  nextSteps?: string[];         // Concrete actions for next session
  warnings?: string[];          // Continuity issues, contradictions
}
```

#### 4.2 Section Budgets

Allocate token budgets per section (e.g., 100 tokens for `currentFocus`, 150 for `activeGoals`).

When building plan text:

1. Serialize each section.
2. Truncate sections that exceed budget, prioritizing by importance.
3. Combine into final text with clear headings.

#### 4.3 Priority Scoring

Score items within each section:

- Goals: by progress (stalled goals rank higher) and recency.
- Discoveries: by importance score from analysis.
- Warnings: always high priority.

Only include top-N items per section.

#### 4.4 Storage Format

Store `BedsideNoteContent` as JSON in the `text` field (or a new `structuredContent` field).

Render to plain text for prompt inclusion; keep structured form for UI and programmatic access.

---

### Phase 5: Agent-Driven Bedside-Note Updates

**Goal:** Let the agent explicitly update the bedside note during conversations.

#### 5.1 New Tool: `update_bedside_note`

Add a tool that lets the agent write to the bedside note:

```ts
{
  name: 'update_bedside_note',
  description: 'Update the project planning note with new focus, questions, or next steps.',
  parameters: {
    type: 'object',
    properties: {
      section: { enum: ['current_focus', 'open_questions', 'next_steps', 'warnings'] },
      action: { enum: ['set', 'append', 'remove'] },
      content: { type: 'string' },
    },
    required: ['section', 'action', 'content'],
  },
}
```

#### 5.2 Reflection Prompt

After significant agent actions (e.g., completing an edit or analysis), optionally prompt the agent:

> "Should the bedside note be updated based on this action? If so, call `update_bedside_note`."

This can be gated by a user preference or confidence threshold.

#### 5.3 End-of-Turn Reflection

At the end of each agent turn, run a lightweight reflection:

1. Compare current bedside note to conversation context.
2. If drift detected, auto-generate an update suggestion.
3. Either auto-apply (if low-risk) or surface to user for approval.

---

## Mid-Term Phases (6–7)

### Phase 6: Hierarchical Planning (Sub-Notes)

**Goal:** Support multiple levels of planning granularity.

#### 6.1 Per-Chapter Bedside Notes

Create chapter-scoped bedside notes:

- Tagged `meta:bedside-note`, `chapter:<chapterId>`.
- Evolved when the user edits that chapter or analysis flags chapter-specific issues.

#### 6.2 Per-Arc Bedside Notes

For longer works with explicit arcs:

- Tagged `meta:bedside-note`, `arc:<arcId>`.
- Aggregates chapter-level concerns within the arc.

#### 6.3 Hierarchical Aggregation

When building smart context:

1. Fetch project-level bedside note.
2. Fetch arc-level note for the current arc (if any).
3. Fetch chapter-level note for the active chapter.
4. Merge into a single context section with clear hierarchy:

   ```text
   [PROJECT PLAN]
   ...
   [ARC PLAN: Act 2]
   ...
   [CHAPTER PLAN: Chapter 7]
   ...
   ```

#### 6.4 Automatic Roll-Up

When a chapter-level note is evolved, propagate significant changes up:

- If a chapter flags a new continuity issue, add it to the arc and project notes.
- Use `changeReason: 'roll_up'`.

---

### Phase 7: Conflict Detection and Resolution

**Goal:** Detect when the bedside note contradicts new information and surface conflicts.

#### 7.1 Contradiction Detection

When evolving the bedside note:

1. Compare new plan text to the previous version.
2. Use lightweight heuristics or LLM call to detect contradictions:
   - "Previous: Sarah has blue eyes. New: Sarah's eyes are green."
3. Tag contradictions in the new note: `conflict:detected`.

#### 7.2 Conflict Surfacing

In smart context, if the bedside note has `conflict:detected`:

- Add a `[CONFLICT ALERT]` section to the prompt.
- Include both the old and new statements.

#### 7.3 Resolution Strategies

- **Auto-resolve:** If confidence is high (e.g., new analysis explicitly corrects old fact), mark conflict resolved.
- **Agent-assisted:** Prompt the agent to resolve: "The bedside note has conflicting information. Which is correct?"
- **User-assisted:** Surface in UI for manual resolution.

---

## Long-Term Phases (8–10)

### Phase 8: Semantic Retrieval and Embeddings

**Goal:** Enable semantic search over bedside-note history and related memories.

#### 8.1 Embedding Generation

When a bedside note is evolved:

1. Generate an embedding for the new text (via Gemini embedding model or local model).
2. Store in the `embedding` field of `MemoryNote`.

#### 8.2 Semantic Search

Add a `search_bedside_history` tool or internal API:

- Input: natural-language query (e.g., "What was my plan for Seth's character arc?").
- Output: relevant bedside-note versions ranked by semantic similarity.

#### 8.3 Time-Travel Context

Allow the agent to "look back" at what the plan was at a given point:

- "What were my priorities before I started Act 2?"
- Retrieve the closest bedside-note version by timestamp and include in context.

---

### Phase 9: User-Facing UI

**Goal:** Make the bedside note visible and editable by the user.

#### 9.1 Sidebar Panel

Add a "Planning" or "Bedside Note" panel in the sidebar:

- Shows the current bedside-note content (rendered from structured format).
- Sections are collapsible.

#### 9.2 History View

"View history" button expands to show:

- Timeline of bedside-note versions.
- Diff view between versions.
- Filter by `changeReason`.

#### 9.3 Manual Editing

Users can:

- Edit any section directly.
- Add/remove items from lists (open questions, next steps).
- Pin items to prevent auto-removal.

#### 9.4 Notifications

Surface notifications when:

- The bedside note is significantly updated.
- A conflict is detected.
- A stalled goal is flagged.

---

### Phase 10: Cross-Project Learning

**Goal:** Apply insights from one project to others.

#### 10.1 Author-Scoped Bedside Notes

Create an author-level bedside note:

- Tagged `meta:bedside-note`, `scope:author`.
- Tracks cross-project preferences: "I tend to forget secondary characters in Act 2."

#### 10.2 Project Completion Retrospective

When a project is marked complete:

1. Generate a retrospective summary: "Key lessons from this project."
2. Store as an author-scoped memory.
3. Surface in future projects' smart context.

#### 10.3 Transfer Suggestions

When starting a new project:

- Check author-scoped bedside note for relevant warnings.
- Pre-populate project bedside note with "Based on past projects, watch out for X."

---

## Implementation Priorities

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| 3.1 Goal Lifecycle | Low | High | **P1** |
| 3.5 Staleness Refresh | Low | Medium | **P1** |
| 4.1–4.2 Structured Schema + Budgets | Medium | High | **P2** |
| 5.1 Agent Tool | Medium | High | **P2** |
| 3.2 Chapter Transitions | Low | Medium | **P3** |
| 3.3 Session Boundaries | Medium | Medium | **P3** |
| 6.1 Per-Chapter Notes | Medium | Medium | **P3** |
| 7.1–7.2 Conflict Detection | High | High | **P4** |
| 9.1 Sidebar Panel | Medium | High | **P4** |
| 8.1–8.2 Embeddings | High | Medium | **P5** |
| 10.1–10.3 Cross-Project | High | Medium | **P5** |

---

## Testing Strategy

Each phase should include:

1. **Unit tests** for new helpers and triggers.
2. **Integration tests** for evolution flows (mock LLM responses where needed).
3. **Manual verification** of prompt content and UI rendering.

For phases involving LLM calls (conflict detection, reflection), use snapshot tests with known inputs/outputs.

---

## Documentation Updates

As each phase lands:

- Update `docs/MEMORY_SYSTEM.md` §6.1 with new triggers and behaviors.
- Update `docs/AGENT_TOOLS_REFERENCE.md` if new tools are added.
- Update this roadmap to mark phases complete and capture learnings.

---

## Open Questions

- **Token budget:** How much of the smart context budget should the bedside note consume? Current default is part of the memory allocation; structured format may need its own budget line.
- **User control:** Should users be able to disable auto-evolution? Pin certain content?
- **Multi-author:** If collaborative editing is ever supported, how do bedside notes merge?
- **Privacy:** Bedside notes may contain sensitive story details. Ensure they are not inadvertently logged or exported.

---

## References

- `docs/MEMORY_SYSTEM.md` — Memory architecture and context integration.
- `docs/AGENT_TOOLS_REFERENCE.md` — Tool schema and execution.
- `docs/APP_BRAIN_FLOW.md` — AppBrain event and state flow.
- `services/memory/chains.ts` — Memory chain implementation.
- `features/agent/hooks/useMemoryIntelligence.ts` — Analysis-driven evolution.
- `services/appBrain/proactiveThinker.ts` — Proactive-thinking evolution.
