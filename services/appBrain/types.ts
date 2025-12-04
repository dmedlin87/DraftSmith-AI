/**
 * App Brain Types
 * 
 * Unified state types for the omniscient agent architecture.
 * Single source of truth for all application knowledge.
 */

import { Chapter, Branch, InlineComment, Lore, ManuscriptIndex } from '@/types/schema';
import { AnalysisResult, CharacterProfile, ChatMessage, HighlightRange } from '@/types';
import { 
  ManuscriptHUD, 
  EntityGraph, 
  Timeline, 
  StyleFingerprint, 
  AttentionHeatmap,
  ManuscriptIntelligence 
} from '@/types/intelligence';
import { Persona } from '@/types/personas';

// ─────────────────────────────────────────────────────────────────────────────
// CORE STATE
// ─────────────────────────────────────────────────────────────────────────────

export interface ManuscriptState {
  projectId: string | null;
  projectTitle: string;
  chapters: Chapter[];
  activeChapterId: string | null;
  currentText: string;
  branches: Branch[];
  activeBranchId: string | null;
  setting?: { timePeriod: string; location: string };
}

export interface IntelligenceState {
  hud: ManuscriptHUD | null;
  full: ManuscriptIntelligence | null;
  entities: EntityGraph | null;
  timeline: Timeline | null;
  style: StyleFingerprint | null;
  heatmap: AttentionHeatmap | null;
  lastProcessedAt: number;
}

export interface AnalysisState {
  result: AnalysisResult | null;
  status: {
    pacing: 'idle' | 'loading' | 'complete' | 'error';
    characters: 'idle' | 'loading' | 'complete' | 'error';
    plot: 'idle' | 'loading' | 'complete' | 'error';
    setting: 'idle' | 'loading' | 'complete' | 'error';
  };
  inlineComments: InlineComment[];
}

export interface LoreState {
  characters: CharacterProfile[];
  worldRules: string[];
  manuscriptIndex: ManuscriptIndex | null;
}

export interface UIState {
  cursor: {
    position: number;
    scene: string | null;
    paragraph: string | null;
  };
  selection: {
    start: number;
    end: number;
    text: string;
  } | null;
  activePanel: string;
  activeView: 'editor' | 'storyboard';
  isZenMode: boolean;
  activeHighlight: HighlightRange | null;
  microphone: MicrophoneState;
}

export interface MicrophoneState {
  status: 'idle' | 'listening' | 'error';
  mode: 'text' | 'voice';
  lastTranscript: string | null;
  error: string | null;
}

export interface SessionState {
  chatHistory: ChatMessage[];
  currentPersona: Persona | null;
  pendingToolCalls: PendingToolCall[];
  lastAgentAction: AgentAction | null;
  isProcessing: boolean;
}

export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'executing' | 'complete' | 'error';
  result?: string;
}

export interface AgentAction {
  type: string;
  description: string;
  timestamp: number;
  success: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED STATE
// ─────────────────────────────────────────────────────────────────────────────

export interface AppBrainState {
  manuscript: ManuscriptState;
  intelligence: IntelligenceState;
  analysis: AnalysisState;
  lore: LoreState;
  ui: UIState;
  session: SessionState;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────

// Base event shape with timestamp
export interface AppEventBase {
  timestamp: number;
}

export interface ChapterIssueSummary {
  description: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

export interface WatchedEntitySummary {
  name: string;
  reason?: string;
  priority?: 'high' | 'medium' | 'low';
}

export type AppEvent =
  | AppEventBase & { type: 'SELECTION_CHANGED'; payload: { text: string; start: number; end: number } }
  | AppEventBase & { type: 'CURSOR_MOVED'; payload: { position: number; scene: string | null } }
  | AppEventBase & { type: 'CHAPTER_SWITCHED'; payload: { chapterId: string; title: string } }
  | AppEventBase & {
      type: 'CHAPTER_CHANGED';
      payload: {
        projectId: string;
        chapterId: string;
        title: string;
        issues?: ChapterIssueSummary[];
        watchedEntities?: WatchedEntitySummary[];
      };
    }
  | AppEventBase & { type: 'TEXT_CHANGED'; payload: { length: number; delta: number } }
  | AppEventBase & {
      type: 'ANALYSIS_COMPLETED';
      payload: { section: string; status?: 'success' | 'error'; detail?: string };
    }
  | AppEventBase & { type: 'EDIT_MADE'; payload: { author: 'user' | 'agent'; description: string } }
  | AppEventBase & { type: 'COMMENT_ADDED'; payload: { comment: InlineComment } }
  | AppEventBase & { type: 'INTELLIGENCE_UPDATED'; payload: { tier: 'instant' | 'debounced' | 'full' } }
  | AppEventBase & { type: 'TOOL_EXECUTED'; payload: { tool: string; success: boolean } }
  | AppEventBase & { type: 'NAVIGATION_REQUESTED'; payload: { target: string; position?: number } }
  // Enhancement 2B & 4C: Additional events for streaming context
  | AppEventBase & { type: 'BRANCH_SWITCHED'; payload: { branchId: string; name?: string } }
  | AppEventBase & { type: 'ANALYSIS_COMPLETE'; payload: { type: string } }
  | AppEventBase & { type: 'MEMORY_CREATED'; payload: { text: string; id: string } }
  | AppEventBase & { type: 'PANEL_SWITCHED'; payload: { panel: string } }
  | AppEventBase & { type: 'LORE_UPDATED'; payload: { changeType: 'character' | 'rule'; id?: string } }
  | AppEventBase & { type: 'DOCUMENT_SAVED'; payload: { chapterId: string } }
  | AppEventBase & { type: 'ZEN_MODE_TOGGLED'; payload: { enabled: boolean } };

export type EventHandler = (event: AppEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface NavigateToTextParams {
  query: string;
  searchType?: 'exact' | 'fuzzy' | 'dialogue' | 'character_mention';
  character?: string;
  chapter?: string;
}

export interface UpdateManuscriptParams {
  searchText: string;
  replacementText: string;
  description: string;
}

export interface RewriteSelectionParams {
  mode: 'clarify' | 'expand' | 'condense' | 'tone_shift';
  targetTone?: string;
}

export interface AppBrainActions {
  // Navigation
  navigateToText: (params: NavigateToTextParams) => Promise<string>;
  jumpToChapter: (identifier: string) => Promise<string>;
  jumpToScene: (sceneType: string, direction: 'next' | 'previous') => Promise<string>;
  scrollToPosition: (position: number) => void;
  
  // Editing
  updateManuscript: (params: UpdateManuscriptParams) => Promise<string>;
  appendText: (text: string, description: string) => Promise<string>;
  undo: () => Promise<string>;
  redo: () => Promise<string>;
  
  // Analysis
  getCritiqueForSelection: (focus?: string) => Promise<string>;
  runAnalysis: (section?: string) => Promise<string>;
  
  // UI Control (now async, using Command Pattern)
  switchPanel: (panel: string) => Promise<string>;
  toggleZenMode: () => Promise<string>;
  highlightText: (start: number, end: number, style?: string) => Promise<string>;
  setMicrophoneState: (state: Partial<MicrophoneState>) => void;

  // Knowledge
  queryLore: (query: string) => Promise<string>;
  getCharacterInfo: (name: string) => Promise<string>;
  getTimelineContext: (range: 'before' | 'after' | 'nearby') => Promise<string>;
  
  // Generation
  rewriteSelection: (params: RewriteSelectionParams) => Promise<string>;
  continueWriting: () => Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentContextOptions {
  deepAnalysis?: boolean;
}

export interface AppBrainContext {
  /** Full context string for agent system prompt */
  getAgentContext: (options?: AgentContextOptions) => string;
  
  /** Full context with memory (async) - primary builder for agent sessions */
  getAgentContextWithMemory: (projectId: string | null) => Promise<string>;
  
  /** Token-efficient compressed context */
  getCompressedContext: () => string;
  
  /** Context focused on navigation/search capabilities */
  getNavigationContext: () => string;
  
  /** Context focused on current editing state */
  getEditingContext: () => string;
  
  /** Get recent events for agent awareness */
  getRecentEvents: (count?: number) => AppEvent[];
}
