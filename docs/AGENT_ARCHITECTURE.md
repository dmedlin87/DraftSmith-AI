# Omniscient Agent Architecture

## Vision

A **unified agent layer** that has complete awareness of the application state—seeing everything the user sees, knowing what the intelligence layer knows, and capable of controlling any aspect of the app through well-defined tools.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Editor    │  │   Chat UI   │  │  Voice UI   │  │  Analysis   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
          └────────────────┼────────────────┼────────────────┘
                           │                │
                           ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        APP BRAIN (Context Hub)                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Unified Knowledge State                       ││
│  │  • manuscript: text, chapters, branches, history                 ││
│  │  • intelligence: HUD, entities, timeline, style, heatmap        ││
│  │  • analysis: critiques, suggestions, plot issues                 ││
│  │  • lore: characters, world rules, relationships                  ││
│  │  • ui: cursor, selection, active panels, view mode              ││
│  │  • session: chat history, agent state, pending actions           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   Event Bus      │  │   Subscriptions  │  │   Change Log     │  │
│  │  (pub/sub)       │  │  (agent listens) │  │  (audit trail)   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Agent Orchestrator                            ││
│  │  • Receives user intent (text, voice, gesture)                   ││
│  │  • Builds context-aware prompts from AppBrain                    ││
│  │  • Executes tool calls with full app access                      ││
│  │  • Routes to text model or voice model based on mode             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Agent Tools (Actions)                         ││
│  │                                                                  ││
│  │  NAVIGATION                    EDITING                           ││
│  │  • navigate_to_text            • update_manuscript               ││
│  │  • search_dialogue             • append_text                     ││
│  │  • search_character_mentions   • undo / redo                     ││
│  │  • jump_to_chapter             • create_branch                   ││
│  │  • jump_to_scene                                                 ││
│  │                                                                  ││
│  │  ANALYSIS                      UI CONTROL                        ││
│  │  • get_critique_for_selection  • switch_panel                    ││
│  │  • explain_plot_issue          • toggle_zen_mode                 ││
│  │  • get_pacing_at_cursor        • show_character_graph            ││
│  │  • run_full_analysis           • highlight_text                  ││
│  │                                                                  ││
│  │  KNOWLEDGE                     GENERATION                        ││
│  │  • query_lore                  • rewrite_selection               ││
│  │  • get_character_info          • continue_writing                ││
│  │  • check_contradiction         • suggest_dialogue                ││
│  │  • get_timeline_context        • generate_scene_beat             ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PERSISTENCE LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    IndexedDB (Dexie)                             ││
│  │  • projects: Project metadata, settings                         ││
│  │  • chapters: Content, branches, analysis cache                   ││
│  │  • memories: Agent memory notes (facts, issues, preferences)     ││
│  │  • goals: Agent goals and progress per project                   ││
│  │  • watchedEntities: Characters/elements to proactively monitor   ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### 1. Single Source of Truth

All data flows through `AppBrain`. No component holds isolated state that the agent can't see.

### 2. Agent Sees What User Sees

The agent receives:

- Current cursor position and selection
- Active chapter and visible text
- Open panels and current view mode
- Recent analysis results and critiques
- Intelligence HUD (entities, pacing, style alerts)
- User's edit history

### 3. Bidirectional Control

- **User → Agent**: "Take me to where Sarah says goodbye"
- **Agent → App**: Calls `navigate_to_text({ search: "Sarah", dialogue: true, keywords: ["goodbye"] })`
- **App → User**: Editor scrolls, highlights text, shows context

### 4. Context Flows Freely

```typescript
// Before: Manual, fragmented context passing
const agent = useAgentService(text, { lore, chapters, analysis, intelligenceHUD });

// After: Automatic context from AppBrain
const agent = useAgent(); // Automatically has full context
```

---

## Implementation Plan

### Phase 1: App Brain (Foundation)

Create a unified context provider that aggregates all state:

```typescript
// services/appBrain/index.ts
export interface AppBrainState {
  // Manuscript
  manuscript: {
    projectId: string;
    chapters: Chapter[];
    activeChapterId: string;
    currentText: string;
    branches: Branch[];
    activeBranchId: string | null;
  };
  
  // Intelligence (from deterministic layer)
  intelligence: {
    hud: ManuscriptHUD | null;
    entities: EntityGraph | null;
    timeline: Timeline | null;
    style: StyleFingerprint | null;
    heatmap: AttentionHeatmap | null;
  };
  
  // Analysis (from AI layer)
  analysis: {
    result: AnalysisResult | null;
    status: AnalysisStatus;
    inlineComments: InlineComment[];
  };
  
  // Lore
  lore: {
    characters: CharacterProfile[];
    worldRules: string[];
    relationships: Relationship[];
  };
  
  // UI State
  ui: {
    cursor: { position: number; scene: string | null };
    selection: { start: number; end: number; text: string } | null;
    activePanel: SidebarTab;
    activeView: MainView;
    isZenMode: boolean;
  };
  
  // Session
  session: {
    chatHistory: ChatMessage[];
    pendingToolCalls: ToolCall[];
    lastAgentAction: AgentAction | null;
  };
}

// The Brain provides derived context for AI prompts
export interface AppBrainContext {
  getAgentContext(): string;           // Full context string for agent prompt
  getCompressedContext(): string;      // Token-efficient version
  getNavigationContext(): string;      // For search/navigate tools
  getEditingContext(): string;         // For edit tools
}
```

### Phase 2: Enhanced Agent Tools

Expand the tool set for full app control:

```typescript
// services/gemini/agentTools.ts

export const NAVIGATION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'navigate_to_text',
    description: 'Search for and navigate to specific text in the manuscript. Can search dialogue, character mentions, or general text.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Text to search for' },
        searchType: { type: Type.STRING, enum: ['exact', 'fuzzy', 'dialogue', 'character_mention'] },
        character: { type: Type.STRING, description: 'If searching dialogue/mentions, the character name' },
        chapter: { type: Type.STRING, description: 'Optional: Limit search to specific chapter title' }
      },
      required: ['query']
    }
  },
  {
    name: 'jump_to_chapter',
    description: 'Switch to a specific chapter by title or number',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { type: Type.STRING, description: 'Chapter title or number' }
      },
      required: ['identifier']
    }
  },
  {
    name: 'jump_to_scene',
    description: 'Navigate to a specific scene type (action, dialogue, exposition, etc.)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sceneType: { type: Type.STRING, enum: ['action', 'dialogue', 'exposition', 'transition', 'climax'] },
        direction: { type: Type.STRING, enum: ['next', 'previous'], description: 'Direction from cursor' }
      },
      required: ['sceneType']
    }
  }
];

export const ANALYSIS_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_critique_for_selection',
    description: 'Get detailed writing feedback for the currently selected text',
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: { type: Type.STRING, enum: ['prose', 'pacing', 'dialogue', 'clarity', 'all'] }
      }
    }
  },
  {
    name: 'explain_plot_issue',
    description: 'Get detailed explanation of a specific plot issue from the analysis',
    parameters: {
      type: Type.OBJECT,
      properties: {
        issueIndex: { type: Type.NUMBER, description: 'Index of the plot issue to explain' }
      },
      required: ['issueIndex']
    }
  },
  {
    name: 'check_contradiction',
    description: 'Check if text contradicts established facts about a character or the world',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: 'Text to check' },
        entity: { type: Type.STRING, description: 'Character or world element to check against' }
      },
      required: ['text']
    }
  }
];

export const UI_CONTROL_TOOLS: FunctionDeclaration[] = [
  {
    name: 'switch_panel',
    description: 'Open a specific sidebar panel',
    parameters: {
      type: Type.OBJECT,
      properties: {
        panel: { type: Type.STRING, enum: ['analysis', 'chapters', 'graph', 'lore', 'history', 'chat'] }
      },
      required: ['panel']
    }
  },
  {
    name: 'highlight_text',
    description: 'Highlight a range of text to draw user attention',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start: { type: Type.NUMBER },
        end: { type: Type.NUMBER },
        style: { type: Type.STRING, enum: ['warning', 'suggestion', 'info'] }
      },
      required: ['start', 'end']
    }
  },
  {
    name: 'toggle_zen_mode',
    description: 'Enter or exit distraction-free writing mode'
  }
];

export const KNOWLEDGE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'query_lore',
    description: 'Query the lore bible for information about characters, world rules, or relationships',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Natural language question about the story world' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_character_info',
    description: 'Get all known information about a character',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING }
      },
      required: ['name']
    }
  },
  {
    name: 'get_timeline_context',
    description: 'Get timeline events and causal chains related to current cursor position',
    parameters: {
      type: Type.OBJECT,
      properties: {
        range: { type: Type.STRING, enum: ['before', 'after', 'nearby'], description: 'Temporal range relative to cursor' }
      }
    }
  }
];

export const GENERATION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'rewrite_selection',
    description: 'Offer rewrite variations for the selected text',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, enum: ['clarify', 'expand', 'condense', 'tone_shift'] },
        targetTone: { type: Type.STRING, description: 'For tone_shift mode' }
      },
      required: ['mode']
    }
  },
  {
    name: 'continue_writing',
    description: 'Generate continuation text from cursor position',
    parameters: {
      type: Type.OBJECT,
      properties: {
        direction: { type: Type.STRING, enum: ['continue', 'bridge_to_next_scene'] },
        length: { type: Type.STRING, enum: ['short', 'medium', 'long'] }
      }
    }
  },
  {
    name: 'suggest_dialogue',
    description: 'Generate dialogue options for a character',
    parameters: {
      type: Type.OBJECT,
      properties: {
        character: { type: Type.STRING },
        emotion: { type: Type.STRING },
        context: { type: Type.STRING, description: 'What the dialogue should accomplish' }
      },
      required: ['character']
    }
  }
];
```

### Phase 3: Agent Orchestrator

Unified hook that handles both text and voice:

```typescript
// features/agent/hooks/useAgentOrchestrator.ts

export interface UseAgentOrchestratorOptions {
  mode: 'text' | 'voice';
  persona?: Persona;
}

export interface AgentOrchestratorResult {
  // State
  isReady: boolean;
  isProcessing: boolean;
  messages: ChatMessage[];
  lastAction: AgentAction | null;
  
  // Text Mode
  sendMessage: (message: string) => Promise<void>;
  
  // Voice Mode
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  isVoiceActive: boolean;
  
  // Control
  abort: () => void;
  reset: () => void;
  setPersona: (persona: Persona) => void;
}

export function useAgentOrchestrator(
  options: UseAgentOrchestratorOptions
): AgentOrchestratorResult {
  const brain = useAppBrain();
  const { mode, persona } = options;
  
  // Tool execution handler with full app access
  const executeToolCall = useCallback(async (
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    switch (toolName) {
      // Navigation
      case 'navigate_to_text':
        return brain.actions.navigateToText(args as NavigateParams);
      case 'jump_to_chapter':
        return brain.actions.jumpToChapter(args.identifier as string);
      
      // Editing
      case 'update_manuscript':
        return brain.actions.updateManuscript(args as UpdateParams);
      
      // Analysis
      case 'get_critique_for_selection':
        return brain.actions.getCritiqueForSelection(args.focus as string);
      
      // UI Control
      case 'switch_panel':
        return brain.actions.switchPanel(args.panel as SidebarTab);
      case 'toggle_zen_mode':
        return brain.actions.toggleZenMode();
      
      // Knowledge
      case 'query_lore':
        return brain.actions.queryLore(args.query as string);
      case 'get_character_info':
        return brain.actions.getCharacterInfo(args.name as string);
      
      // Generation
      case 'rewrite_selection':
        return brain.actions.rewriteSelection(args as RewriteParams);
      
      default:
        return `Unknown tool: ${toolName}`;
    }
  }, [brain]);
  
  // Build context-aware system prompt
  const buildSystemPrompt = useCallback(() => {
    const basePrompt = AGENT_SYSTEM_INSTRUCTION;
    const contextBlock = brain.getAgentContext();
    const personaBlock = persona ? buildPersonaInstruction(persona) : '';
    
    return `${basePrompt}\n\n${contextBlock}\n\n${personaBlock}`;
  }, [brain, persona]);
  
  // ... rest of implementation
}
```

### Phase 4: Event Bus

Allow agent to react to user actions proactively:

```typescript
// services/appBrain/eventBus.ts

export type AppEvent = 
  | { type: 'SELECTION_CHANGED'; payload: { text: string; start: number; end: number } }
  | { type: 'CURSOR_MOVED'; payload: { position: number; scene: string | null } }
  | { type: 'CHAPTER_SWITCHED'; payload: { chapterId: string } }
  | { type: 'ANALYSIS_COMPLETED'; payload: { section: AnalysisSection } }
  | { type: 'EDIT_MADE'; payload: { type: 'user' | 'agent'; description: string } }
  | { type: 'COMMENT_ADDED'; payload: { comment: InlineComment } }
  | { type: 'CONTRADICTION_DETECTED'; payload: { contradiction: Contradiction } };

export class EventBus {
  private listeners: Map<AppEvent['type'], Set<(event: AppEvent) => void>> = new Map();
  private history: AppEvent[] = [];
  
  emit(event: AppEvent) {
    this.history.push(event);
    this.listeners.get(event.type)?.forEach(listener => listener(event));
  }
  
  subscribe(type: AppEvent['type'], callback: (event: AppEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.listeners.get(type)!.delete(callback);
  }
  
  getRecentEvents(count: number = 10): AppEvent[] {
    return this.history.slice(-count);
  }
}
```

### Phase 5: Database Extensions

Add new tables for unified knowledge:

```typescript
// services/db.ts

export class QuillAIDB extends Dexie {
  projects!: Table<Project>;
  chapters!: Table<Chapter>;
  
  // NEW: Unified knowledge graph
  knowledge!: Table<KnowledgeEntry>;
  
  // NEW: Agent conversation history
  sessions!: Table<AgentSession>;
  
  // NEW: Event audit log
  events!: Table<PersistedEvent>;

  constructor() {
    super('QuillAIDB');

    this.version(2).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt',
      knowledge: 'id, projectId, type, entityId, [projectId+type]',
      sessions: 'id, projectId, createdAt',
      events: 'id, projectId, type, timestamp, [projectId+type]'
    });
  }
}

// Knowledge entry types
export interface KnowledgeEntry {
  id: string;
  projectId: string;
  type: 'character' | 'location' | 'event' | 'rule' | 'relationship';
  entityId: string;
  data: Record<string, unknown>;
  sources: Array<{ chapterId: string; offset: number; text: string }>;
  updatedAt: number;
}

export interface AgentSession {
  id: string;
  projectId: string;
  messages: ChatMessage[];
  persona: string;
  createdAt: number;
  updatedAt: number;
}

export interface PersistedEvent {
  id: string;
  projectId: string;
  type: AppEvent['type'];
  payload: unknown;
  timestamp: number;
}
```

---

## User Interaction Examples

### Example 1: Natural Navigation

```text
User: "Take me to where Will says he loves her"

Agent Internal Process:
1. Parse intent: navigate_to_text
2. Extract params: { searchType: 'dialogue', character: 'Will', query: 'love' }
3. Execute tool: Search dialogue map for Will's dialogue containing "love"
4. Return: Found at Chapter 3, offset 4521
5. Action: Scroll editor, highlight text, show context

Agent Response: "Found it! Will says 'I've always loved you, Sarah' in Chapter 3. I've highlighted the passage for you."
```

### Example 2: Selection-Based Critique

```text
User: [Selects paragraph] "How can I make this more tense?"

Agent Internal Process:
1. Get selection from AppBrain: { start: 1200, end: 1450, text: "..." }
2. Get intelligence context: { scene: 'dialogue', tension: 'low', pacing: 'slow' }
3. Execute: get_critique_for_selection({ focus: 'pacing' })
4. Generate response with specific rewrite suggestions

Agent Response: "This section has slow pacing due to long sentences and passive constructions. Try:
- Breaking the dialogue with action beats
- Using shorter sentences during the confrontation
- Replacing 'was standing' with 'stood'

Want me to show you a rewritten version?"
```

### Example 3: Proactive Assistance

```text
[User writes: "Sarah's blue eyes sparkled"]

Event Bus: EDIT_MADE → CONTRADICTION_DETECTED

Agent Proactive Alert: "⚠️ Hold on—in Chapter 1, Sarah has green eyes. Would you like me to:
1. Update the lore to blue eyes
2. Change this to green eyes  
3. Ignore (maybe it's intentional)"
```

---

## Voice Mode Considerations (Experimental)

Voice mode uses the same unified architecture but is currently experimental/partial. It reuses AppBrain context but optimizes for latency and a safety-limited tool set:

```typescript
// Voice uses compressed context to reduce token overhead
const voiceSystemPrompt = `
${VOICE_BASE_INSTRUCTION}
${brain.getCompressedContext()}  // Compact AppBrain-powered context
`;

// Voice model selection (configured in config/models.ts)
const VOICE_MODEL = ModelConfig.liveAudio; // Optimized for real-time audio

// Tools available in voice mode (subset for safety)
// VOICE_SAFE_TOOLS is defined in services/gemini/agentTools.ts
const VOICE_TOOLS = VOICE_SAFE_TOOLS; // e.g. navigation, safe analysis, basic UI
```

---

## Migration Path

Status (current):

- Phases 1–3 are implemented (AppBrain, unified tools, event bus).
- Phase 4 is realized via the agent memory tables (`memories`, `goals`, `watchedEntities`).
- Phase 5 (voice integration on top of compressed context + VOICE_SAFE_TOOLS) is in progress/experimental.

Planned rollout (original roadmap):

1. **Phase 1**: Create `AppBrainProvider`, migrate existing contexts to feed into it
2. **Phase 2**: Implement new agent tools, update `useAgentService` to use AppBrain
3. **Phase 3**: Add event bus, implement proactive agent features
4. **Phase 4**: Extend database with persistent knowledge/memory
5. **Phase 5**: Voice mode integration with unified architecture

---

## File Structure

```text
services/
├── appBrain/
│   ├── index.ts              # AppBrain exports (state, events, builders)
│   ├── eventBus.ts           # Event pub/sub system
│   ├── contextBuilder.ts     # AI context string generation
│   └── types.ts              # Unified AppBrain types (state, actions, events)
├── gemini/
│   ├── agent.ts              # Agent session creation
│   ├── agentTools.ts         # NEW: Full tool definitions
│   └── ...
└── db.ts                     # Dexie DB with projects, chapters, and agent memory tables

features/
├── agent/
│   ├── hooks/
│   │   ├── useAgentOrchestrator.ts  # Canonical omniscient agent hook (AppBrain-powered)
│   │   ├── useAgentService.ts       # Legacy manual-context hook (deprecated)
│   │   └── useAgenticEditor.ts      # Legacy agentic editor wrapper (deprecated)
│   ├── components/
│   │   └── ChatInterface.tsx        # Legacy chat UI using useAgentService (deprecated)
│   └── ...
└── shared/
    └── context/
        └── AppBrainContext.tsx       # React wrapper over AppBrain (canonical source for agent state)
```

---

## Success Metrics

- **Context Completeness**: Agent has 100% visibility into app state
- **Response Relevance**: Agent responses reference current context correctly
- **Action Success Rate**: Tool calls execute without errors
- **User Satisfaction**: Natural commands work as expected
- **Data Consistency**: No disconnects between what agent knows and app state
