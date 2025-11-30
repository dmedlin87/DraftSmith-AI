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

export type AppEvent = 
  | { type: 'SELECTION_CHANGED'; payload: { text: string; start: number; end: number } }
  | { type: 'CURSOR_MOVED'; payload: { position: number; scene: string | null } }
  | { type: 'CHAPTER_SWITCHED'; payload: { chapterId: string; title: string } }
  | { type: 'TEXT_CHANGED'; payload: { length: number; delta: number } }
  | { type: 'ANALYSIS_COMPLETED'; payload: { section: string } }
  | { type: 'EDIT_MADE'; payload: { author: 'user' | 'agent'; description: string } }
  | { type: 'COMMENT_ADDED'; payload: { comment: InlineComment } }
  | { type: 'INTELLIGENCE_UPDATED'; payload: { tier: 'instant' | 'debounced' | 'full' } }
  | { type: 'TOOL_EXECUTED'; payload: { tool: string; success: boolean } }
  | { type: 'NAVIGATION_REQUESTED'; payload: { target: string; position?: number } };

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
  
  // UI Control
  switchPanel: (panel: string) => void;
  toggleZenMode: () => void;
  highlightText: (start: number, end: number, style?: string) => void;
  
  // Knowledge
  queryLore: (query: string) => Promise<string>;
  getCharacterInfo: (name: string) => Promise<string>;
  getTimelineContext: (range: 'before' | 'after' | 'nearby') => Promise<string>;
  
  // Generation
  rewriteSelection: (params: RewriteSelectionParams) => Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

export interface AppBrainContext {
  /** Full context string for agent system prompt */
  getAgentContext: () => string;
  
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
