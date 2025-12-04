// ────────────────────────────────────────────────────────────────────────────────
// Agent Memory System - Type Definitions
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Memory scope determines whether a note applies to a specific project
 * or globally to the author's preferences and style.
 */
export type MemoryScope = 'project' | 'author';

/**
 * Type classification for memory notes.
 * - observation: Something the agent noticed about the manuscript
 * - issue: A problem that needs resolution (e.g., "Seth disappears in Act 2")
 * - fact: Established truth about the story world or characters
 * - plan: A planned action or goal step
 * - preference: Author's writing style or assistance preferences
 */
export type MemoryNoteType = 'observation' | 'issue' | 'fact' | 'plan' | 'preference';

/**
 * Structured payload for bedside-note planning memories (Phase 4 roadmap).
 */
export interface BedsideNoteGoalSummary {
  /** Goal title to display */
  title: string;
  /** Optional progress percentage */
  progress?: number;
  /** Goal status for context (active/completed/abandoned) */
  status?: GoalStatus;
  /** Optional additional detail for the goal */
  note?: string;
  /** Timestamp for prioritization */
  updatedAt?: number;
}

export interface BedsideNoteContent {
  /** What the user or agent should focus on now */
  currentFocus?: string;
  /** Outstanding questions that need resolution */
  openQuestions?: string[];
  /** Highest-priority goals with progress */
  activeGoals?: BedsideNoteGoalSummary[];
  /** New facts, issues, or insights since the last update */
  recentDiscoveries?: string[];
  /** Concrete next steps for the next session */
  nextSteps?: string[];
  /** Continuity risks or contradictions to watch */
  warnings?: string[];
}

/**
 * MemoryNote - A single unit of agent memory.
 * 
 * Project-scoped notes track story-specific information (characters, plot decisions).
 * Author-scoped notes track user preferences that apply across all projects.
 */
export interface MemoryNote {
  /** Unique identifier */
  id: string;
  
  /** Whether this note applies to a project or globally to the author */
  scope: MemoryScope;
  
  /** Required when scope is 'project' */
  projectId?: string;
  
  /** The natural language content of the note */
  text: string;
  
  /** Classification of what kind of memory this is */
  type: MemoryNoteType;
  
  /** 
   * Tags for filtering and retrieval.
   * Examples: ['character:seth', 'arc', 'act2'], ['style', 'dialogue']
   */
  topicTags: string[];
  
  /** 
   * Importance score (0-1) for ranking in retrieval.
   * Higher values surface first in context building.
   */
  importance: number;
  
  /** Creation timestamp (epoch ms) */
  createdAt: number;
  /** Last update timestamp (epoch ms) */
  updatedAt?: number;
  
  /**
   * Optional embedding vector for semantic search.
   * Added when vector search is enabled (Phase 2).
   */
  embedding?: number[];

  /** Optional structured content for prompt-aware memories (e.g., bedside note) */
  structuredContent?: Record<string, unknown>;
}

/**
 * Status of an agent goal.
 */
export type GoalStatus = 'active' | 'completed' | 'abandoned';

/**
 * AgentGoal - A tracked objective the agent is working toward.
 * 
 * Goals allow the agent to maintain focus across multiple interactions
 * and proactively surface relevant information.
 */
export interface AgentGoal {
  /** Unique identifier */
  id: string;
  
  /** The project this goal belongs to */
  projectId: string;
  
  /** Short description of the goal */
  title: string;
  
  /** Longer description of what needs to be accomplished */
  description?: string;
  
  /** Current status of the goal */
  status: GoalStatus;
  
  /** Progress percentage (0-100) */
  progress: number;
  
  /** IDs of related MemoryNotes */
  relatedNoteIds?: string[];
  
  /** Creation timestamp (epoch ms) */
  createdAt: number;
  
  /** Last update timestamp (epoch ms) */
  updatedAt?: number;
}

/**
 * WatchedEntity - Characters or elements the agent should proactively monitor.
 */
export interface WatchedEntity {
  /** Entity identifier (e.g., 'character:seth') */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Project this watch applies to */
  projectId: string;
  
  /** Priority level for surfacing suggestions */
  priority: 'low' | 'medium' | 'high';

  /** Why this entity is being watched */
  reason?: string;

  /** Whether proactive monitoring is enabled for this entity */
  monitoringEnabled?: boolean;

  /** Creation timestamp (epoch ms) */
  createdAt: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Helper Types
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Input for creating a new memory note (without auto-generated fields).
 */
export type CreateMemoryNoteInput = Omit<MemoryNote, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Input for updating an existing memory note.
 */
export type UpdateMemoryNoteInput = Partial<Omit<MemoryNote, 'id' | 'createdAt'>>;

/**
 * Query parameters for listing memory notes.
 */
export interface ListMemoryNotesParams {
  scope?: MemoryScope;
  projectId?: string;
  type?: MemoryNoteType;
  topicTags?: string[];
  minImportance?: number;
  limit?: number;
}

/**
 * Input for creating a new agent goal.
 */
export type CreateGoalInput = Omit<AgentGoal, 'id' | 'createdAt' | 'updatedAt' | 'progress'> & {
  progress?: number;
};

export const BEDSIDE_NOTE_TAG = 'meta:bedside-note';
export const BEDSIDE_NOTE_DEFAULT_TAGS = [
  BEDSIDE_NOTE_TAG,
  'planner:global',
  'arc:story',
];
