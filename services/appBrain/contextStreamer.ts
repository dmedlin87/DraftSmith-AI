/**
 * Context Streamer (Enhancement 2B)
 * 
 * Provides real-time context patches during long agent generations.
 * Enables the agent to be aware of user actions that occur while
 * it is generating a response.
 */

import { eventBus } from './eventBus';
import { AppEvent } from './types';

// Extract event type from AppEvent union
export type EventType = AppEvent['type'];

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextPatch {
  id: string;
  type: EventType;
  summary: string;
  timestamp: number;
  importance: 'low' | 'medium' | 'high';
  data?: Record<string, unknown>;
}

export interface StreamerOptions {
  /** Events to listen for */
  eventTypes?: EventType[];
  /** Maximum patches to queue */
  maxQueueSize?: number;
  /** Minimum importance to queue */
  minImportance?: ContextPatch['importance'];
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANCE CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

const calculateImportance = (event: AppEvent): ContextPatch['importance'] => {
  switch (event.type) {
    // High importance - affects current context significantly
    case 'CHAPTER_SWITCHED':
    case 'CHAPTER_CHANGED':
    case 'BRANCH_SWITCHED':
    case 'ANALYSIS_COMPLETE':
    case 'MEMORY_CREATED':
      return 'high';
    
    // Medium importance - relevant but not critical
    case 'SELECTION_CHANGED':
    case 'CURSOR_MOVED':
    case 'PANEL_SWITCHED':
    case 'LORE_UPDATED':
      return 'medium';
    
    // Low importance - nice to know
    case 'DOCUMENT_SAVED':
    case 'ZEN_MODE_TOGGLED':
    default:
      return 'low';
  }
};

const summarizeEvent = (event: AppEvent): string => {
  switch (event.type) {
    case 'SELECTION_CHANGED':
      const selection = event.payload as { text?: string; start?: number; end?: number };
      if (selection.text) {
        const preview = selection.text.slice(0, 50);
        return `User selected: "${preview}${selection.text.length > 50 ? '...' : ''}"`;
      }
      return 'Selection cleared';
    
    case 'CURSOR_MOVED':
      const cursor = event.payload as { position?: number; scene?: string };
      return `Cursor moved to position ${cursor.position}${cursor.scene ? ` (${cursor.scene} scene)` : ''}`;
    
    case 'CHAPTER_SWITCHED':
    case 'CHAPTER_CHANGED':
      const chapter = event.payload as { chapterId?: string; title?: string };
      return `Switched to chapter: "${chapter.title || chapter.chapterId}"`;
    
    case 'BRANCH_SWITCHED':
      const branch = event.payload as { branchId?: string; name?: string };
      return `Switched to branch: "${branch.name || branch.branchId}"`;
    
    case 'ANALYSIS_COMPLETE':
      return 'Analysis completed - new insights available';
    
    case 'MEMORY_CREATED':
      const memory = event.payload as { text?: string };
      return `New memory: "${memory.text?.slice(0, 40)}..."`;
    
    case 'PANEL_SWITCHED':
      const panel = event.payload as { panel?: string };
      return `Switched to ${panel.panel} panel`;
    
    case 'LORE_UPDATED':
      return 'Lore Bible was updated';
    
    case 'ZEN_MODE_TOGGLED':
      const zen = event.payload as { enabled?: boolean };
      return `Zen mode ${zen.enabled ? 'enabled' : 'disabled'}`;
    
    case 'DOCUMENT_SAVED':
      return 'Document saved';
    
    default:
      return `Event: ${event.type}`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT STREAMER CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages a queue of context patches for streaming updates
 */
export class ContextStreamer {
  private queue: ContextPatch[] = [];
  private unsubscribers: Array<() => void> = [];
  private isActive: boolean = false;
  private options: Required<StreamerOptions>;
  private startTimestamp: number = 0;
  
  constructor(options: StreamerOptions = {}) {
    this.options = {
      eventTypes: options.eventTypes || [
        'SELECTION_CHANGED',
        'CURSOR_MOVED',
        'CHAPTER_CHANGED',
        'CHAPTER_SWITCHED',
        'BRANCH_SWITCHED',
        'ANALYSIS_COMPLETE',
        'MEMORY_CREATED',
        'PANEL_SWITCHED',
        'LORE_UPDATED',
      ],
      maxQueueSize: options.maxQueueSize || 10,
      minImportance: options.minImportance || 'low',
    };
  }
  
  /**
   * Start listening for events
   */
  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.startTimestamp = Date.now();
    this.queue = [];
    
    // Subscribe to relevant events
    for (const eventType of this.options.eventTypes) {
      const unsub = eventBus.subscribe(eventType, (event) => {
        this.handleEvent(event);
      });
      this.unsubscribers.push(unsub);
    }
  }
  
  /**
   * Stop listening and clear queue
   */
  stop(): void {
    this.isActive = false;
    
    // Unsubscribe from all events
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.queue = [];
  }
  
  /**
   * Handle incoming event
   */
  private handleEvent(event: AppEvent): void {
    // Only process events that occurred after we started
    if (event.timestamp < this.startTimestamp) return;
    
    const importance = calculateImportance(event);
    
    // Filter by minimum importance
    const importanceLevels = { low: 0, medium: 1, high: 2 };
    if (importanceLevels[importance] < importanceLevels[this.options.minImportance]) {
      return;
    }
    
    const patch: ContextPatch = {
      id: `patch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: event.type,
      summary: summarizeEvent(event),
      timestamp: event.timestamp,
      importance,
      data: event.payload as Record<string, unknown>,
    };
    
    this.queue.push(patch);
    
    // Trim queue if too large (remove oldest low-importance first)
    while (this.queue.length > this.options.maxQueueSize) {
      const lowestIdx = this.queue.findIndex(p => p.importance === 'low');
      if (lowestIdx >= 0) {
        this.queue.splice(lowestIdx, 1);
      } else {
        this.queue.shift(); // Remove oldest
      }
    }
  }
  
  /**
   * Get next patch from queue (FIFO)
   */
  getNextPatch(): ContextPatch | null {
    return this.queue.shift() || null;
  }
  
  /**
   * Get all pending patches and clear queue
   */
  drainPatches(): ContextPatch[] {
    const patches = [...this.queue];
    this.queue = [];
    return patches;
  }
  
  /**
   * Check if there are pending patches
   */
  hasPendingPatches(): boolean {
    return this.queue.length > 0;
  }
  
  /**
   * Get count of pending patches
   */
  getPendingCount(): number {
    return this.queue.length;
  }
  
  /**
   * Format patches as a context update string
   */
  formatPatchesForPrompt(maxPatches: number = 5): string | null {
    if (this.queue.length === 0) return null;
    
    const patches = this.queue.slice(0, maxPatches);
    
    let output = '[CONTEXT UPDATE - Events since your last message]\n';
    
    for (const patch of patches) {
      const icon = patch.importance === 'high' ? '⚡' : patch.importance === 'medium' ? '📌' : '•';
      output += `${icon} ${patch.summary}\n`;
    }
    
    if (this.queue.length > maxPatches) {
      output += `...and ${this.queue.length - maxPatches} more events\n`;
    }
    
    return output;
  }
  
  /**
   * Get high-importance patches only
   */
  getHighImportancePatches(): ContextPatch[] {
    return this.queue.filter(p => p.importance === 'high');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

let streamerInstance: ContextStreamer | null = null;

export const getContextStreamer = (options?: StreamerOptions): ContextStreamer => {
  if (!streamerInstance) {
    streamerInstance = new ContextStreamer(options);
  }
  return streamerInstance;
};

export const resetContextStreamer = (): void => {
  if (streamerInstance) {
    streamerInstance.stop();
    streamerInstance = null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a streaming context session for an agent turn
 */
export const createStreamingSession = (options?: StreamerOptions): {
  start: () => void;
  stop: () => void;
  getUpdates: () => string | null;
  hasUpdates: () => boolean;
} => {
  const streamer = new ContextStreamer(options);
  
  return {
    start: () => streamer.start(),
    stop: () => streamer.stop(),
    getUpdates: () => streamer.formatPatchesForPrompt(),
    hasUpdates: () => streamer.hasPendingPatches(),
  };
};

/**
 * Check if any significant context changes occurred
 */
export const hasSignificantContextChange = (streamer: ContextStreamer): boolean => {
  return streamer.getHighImportancePatches().length > 0;
};
