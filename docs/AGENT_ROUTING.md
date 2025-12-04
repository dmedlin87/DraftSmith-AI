# Agent Routing Guide

**Audience:** Anyone extending, debugging, or prompting the omniscient agent.  
**Goal:** Provide an end-to-end path (docs + files) so there are no dead ends: start from README, trace how the agent thinks, and know where to patch or inspect.

## Quick menu

- **Understand the flow in 5 minutes:** Read [docs/README.md](./README.md) → skim this guide → open [APP_BRAIN_FLOW.md](./APP_BRAIN_FLOW.md) diagram.  
- **Add or change a tool:** See [Agent tools](#agent-tools-how-to-add-or-change-one).  
- **Debug agent behavior:** See [Debugging playbook](#debugging-playbook).  
- **Bedside note / planning memory:** See [Planning memory triggers](#planning-memory-triggers).

## The routing map (what to open, in order)

1) **Architecture layer map** — [ARCHITECTURE.md](./ARCHITECTURE.md): persistence → editor session → AI engine → agent.  
2) **App Brain & flow** — [APP_BRAIN_FLOW.md](./APP_BRAIN_FLOW.md): mermaid diagram of UI + Brain + memory + orchestrator.  
3) **Omniscient agent vision** — [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md): phases, legacy vs. current paths.  
4) **Memory system** — [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md): schemas, services, prompt integration.  
5) **Bedside-note state** — [HANDOFF_BEDSIDE_NOTES.md](./HANDOFF_BEDSIDE_NOTES.md): current triggers, roadmap, and key files.  
6) **Tools catalog** — [AGENT_TOOLS_REFERENCE.md](./AGENT_TOOLS_REFERENCE.md): available tools and how to add one.

## How the agent gets context (files to inspect)

- **App Brain state + builders:** `services/appBrain/contextBuilder.ts`, `services/appBrain/adaptiveContext.ts`, `services/appBrain/contextStreamer.ts` (prompt assembly, token budgeting, memory relevance).  
- **State provider:** `features/shared/context/AppBrainContext.tsx` (aggregates manuscript, editor, analysis, intelligence, UI/session).  
- **Smart context entrypoint:** `services/appBrain/index.ts` exports `getSmartAgentContext` and profiles (see `PROFILE_ALLOCATIONS`).  
- **Memory fetch + ordering:** `services/memory/index.ts` (memory slices, bedside prioritization).  
- **Model + token budgets:** `config/models.ts`, `config/api.ts`, `config/index.ts` (limits, reserves).  
- **Where prompts are consumed:** `services/gemini/agent.ts` (chat creation), `services/gemini/agentTools.ts` (tools), `services/gemini/agentToolLoop.ts` (execution loop).

## Event bus → Orchestrator → Tool execution

- **Event bus + orchestrator machine:** `services/core/agentOrchestratorMachine.ts`, `services/core/AgentController.ts`, `services/core/agentToolLoop.ts`.  
- **Canonical hook:** `features/agent/hooks/useAgentOrchestrator.ts` (UI entrypoint).  
- **Commands registry:** `services/commands/*` (grouped by domain: editing, navigation, analysis, generation, etc.).  
- **App actions wiring:** `features/shared/context/AppBrainContext.tsx` passes action handlers into the orchestrator.  
- **Legacy path (deprecated):** `features/agent/hooks/useAgentService.ts` + `features/agent/components/ChatInterface.tsx` — prefer orchestrator.

## Agent tools: how to add or change one

1. **Define/modify tool schema:** `services/gemini/agentTools.ts` (FunctionDeclarations).  
2. **Wire execution:** Add or update a command in `services/commands/*.ts` and export it through `services/commands/index.ts`.  
3. **Expose to orchestrator:** Ensure the command is registered in `services/core/agentToolLoop.ts` / `AgentController`.  
4. **Surface in UI (if needed):** Confirm `useAgentOrchestrator` is used by the UI you care about.  
5. **Docs:** Add the tool to [AGENT_TOOLS_REFERENCE.md](./AGENT_TOOLS_REFERENCE.md).  
6. **Tests:** Add coverage under `tests/services/commands/` or feature-level tests as appropriate.

## Planning memory triggers

The bedside-note planning memory is evolved from multiple entrypoints. Trace these in order when debugging:

- **Proactive thinker:** `services/appBrain/proactiveThinker.ts` (chapter transition, significant edits debounce/cooldown).  
- **Analysis → plan:** `features/agent/hooks/useMemoryIntelligence.ts` (turns analysis + goals into plan text).  
- **Goals lifecycle:** `services/memory/index.ts` (goal add/complete/abandon triggers).  
- **Session lifecycle:** `services/memory/sessionLifecycle.ts` (session start/end reminders/summary).  
- **Agent-driven mutations:** `services/memory/bedsideNoteMutations.ts` + `update_bedside_note` tool.  
- **Core evolution logic:** `services/memory/chains.ts` (`evolveBedsideNote`, conflict handling, roll-ups).  
- **UI surfacing:** `features/memory/components/BedsideNotePanel.tsx` (history, conflicts, notifications).  
- **Reference doc:** [HANDOFF_BEDSIDE_NOTES.md](./HANDOFF_BEDSIDE_NOTES.md) lists current triggers and gaps.

## Debugging playbook

1. **Reproduce with App Brain visible:** Confirm `projectId`, active chapter, and pending events in the Brain.  
2. **Inspect prompt assembly:** Log `getSmartAgentContext` output (or use `contextStreamer`) to verify context/profile/budget.  
3. **Check event flow:** Verify the event bus fired and `agentOrchestratorMachine` received the event; inspect `pendingEvents` in `ProactiveThinker` if edits are involved.  
4. **Tool path check:** Ensure the FunctionDeclaration matches the command signature and the command is exported.  
5. **Memory effects:** If bedside-note changes are expected, inspect `evolveBedsideNote` inputs and tags; check cooldowns and thresholds.  
6. **Tests:** Add or run focused tests in `tests/services` / `tests/features/agent` depending on the layer you touched.

## Proposing new agent ideas (where to plug them)

- **New proactive behaviors:** Add to `ProactiveThinker` (debounced, event-driven) and document in [HANDOFF_BEDSIDE_NOTES.md](./HANDOFF_BEDSIDE_NOTES.md) if planning-related.  
- **New context signals:** Extend `AppBrainState` and wire through `contextBuilder.ts` / `adaptiveContext.ts`.  
- **New memory signals:** Add to `services/memory` and surface via `getSmartAgentContext`.  
- **UI affordances:** Add panels or buttons that call `useAgentOrchestrator` rather than bypassing App Brain.

## Prompt and safety considerations

- **Token guard:** Use `config/models.ts` + `services/gemini/tokenGuard.ts` to size prompts before calls.  
- **Budget profiles:** Prefer `selectContextProfile` + `getContextBudgetForModel` in `services/appBrain`.  
- **Conflict and warnings:** Bedside evolution auto-tags conflicts; ensure prompts surface `conflicts`/`warnings` sections from serialized bedside notes.  
- **Cooldowns/debounce:** Respect existing cooldowns in `ProactiveThinker` and `sessionLifecycle` to avoid noisy evolutions.
