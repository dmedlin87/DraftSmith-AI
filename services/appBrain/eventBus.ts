/**
 * Event Bus
 * 
 * Pub/sub system for application-wide events.
 * Enables agent to react to user actions and vice versa.
 */

import { AppEvent, EventHandler } from './types';

const MAX_HISTORY = 100;
const MAX_CHANGE_LOG = 500;
const CHANGE_LOG_STORAGE_KEY = 'quillai_change_log';

const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const loadChangeLog = (): AppEvent[] => {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CHANGE_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[EventBus] Failed to load change log', e);
    return [];
  }
};

const persistChangeLog = (events: AppEvent[]) => {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(CHANGE_LOG_STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    console.warn('[EventBus] Failed to persist change log', e);
  }
};

class EventBusImpl {
  private listeners: Map<AppEvent['type'], Set<EventHandler>> = new Map();
  private globalListeners: Set<EventHandler> = new Set();
  private history: AppEvent[] = [];
  private changeLog: AppEvent[] = loadChangeLog();

  /**
   * Emit an event to all subscribers
   * Automatically adds timestamp if not present
   */
  emit(event: Omit<AppEvent, 'timestamp'> & { timestamp?: number }): void {
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    } as AppEvent;
    
    // Add to history
    this.history.push(eventWithTimestamp);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    // Persist to audit log
    this.changeLog.push(eventWithTimestamp);
    if (this.changeLog.length > MAX_CHANGE_LOG) {
      this.changeLog.shift();
    }
    persistChangeLog(this.changeLog);

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(eventWithTimestamp.type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(eventWithTimestamp);
        } catch (e) {
          console.error(`[EventBus] Listener error for ${event.type}:`, e);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener(eventWithTimestamp);
      } catch (e) {
        console.error(`[EventBus] Global listener error:`, e);
      }
    });
  }

  /**
   * Subscribe to a specific event type
   */
  subscribe(type: AppEvent['type'], handler: EventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  /**
   * Subscribe to all events
   */
  subscribeAll(handler: EventHandler): () => void {
    this.globalListeners.add(handler);
    return () => {
      this.globalListeners.delete(handler);
    };
  }

  /**
   * Get recent events (for agent context)
   */
  getRecentEvents(count: number = 10): AppEvent[] {
    return this.history.slice(-count);
  }

  /**
   * Get persisted change log for audits
   */
  getChangeLog(count: number = MAX_CHANGE_LOG): AppEvent[] {
    return this.changeLog.slice(-count);
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: AppEvent['type'], count: number = 10): AppEvent[] {
    return this.history
      .filter(e => e.type === type)
      .slice(-count);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Clear the persisted change log (primarily for testing)
   */
  clearPersistentLog(): void {
    this.changeLog = [];
    persistChangeLog(this.changeLog);
  }

  /**
   * Subscribe to events intended for the agent orchestrator.
   * Automatically replays recent log entries to provide continuity.
   */
  subscribeForOrchestrator(
    handler: EventHandler,
    options?: { types?: AppEvent['type'][]; replay?: boolean },
  ): () => void {
    const { types, replay = true } = options || {};

    const wrappedHandler: EventHandler = (event) => {
      if (!types || types.includes(event.type)) {
        handler(event);
      }
    };

    if (replay) {
      const toReplay = types
        ? this.changeLog.filter(event => types.includes(event.type))
        : this.changeLog;
      toReplay.forEach(wrappedHandler);
    }

    return this.subscribeAll(wrappedHandler);
  }

  /**
   * Format recent events for AI context
   */
  formatRecentEventsForAI(count: number = 5): string {
    const events = this.getRecentEvents(count);
    if (events.length === 0) return '';

    let output = '[RECENT USER ACTIVITY]\n';
    for (const event of events) {
      output += `• ${this.formatEvent(event)}\n`;
    }
    return output;
  }

  private formatEvent(event: AppEvent): string {
    switch (event.type) {
      case 'SELECTION_CHANGED':
        return `Selected: "${event.payload.text.slice(0, 30)}${event.payload.text.length > 30 ? '...' : ''}"`;
      case 'CURSOR_MOVED':
        return `Cursor at position ${event.payload.position}${event.payload.scene ? ` (${event.payload.scene} scene)` : ''}`;
      case 'CHAPTER_CHANGED':
        return `Moved to chapter "${event.payload.title}"`;
      case 'CHAPTER_SWITCHED':
        return `Switched to "${event.payload.title}"`;
      case 'TEXT_CHANGED':
        return `Text ${event.payload.delta > 0 ? 'added' : 'removed'} (${Math.abs(event.payload.delta)} chars)`;
      case 'ANALYSIS_COMPLETED': {
        const status = event.payload.status === 'error' ? ' failed' : ' complete';
        const detail = event.payload.detail ? ` – ${event.payload.detail}` : '';
        return `Analysis${status}: ${event.payload.section}${detail}`;
      }
      case 'EDIT_MADE':
        return `Edit by ${event.payload.author}: ${event.payload.description}`;
      case 'COMMENT_ADDED':
        return `Comment added: ${event.payload.comment.issue.slice(0, 30)}...`;
      case 'INTELLIGENCE_UPDATED':
        return `Intelligence updated (${event.payload.tier})`;
      case 'TOOL_EXECUTED':
        return `Tool "${event.payload.tool}" ${event.payload.success ? 'succeeded' : 'failed'}`;
      case 'NAVIGATION_REQUESTED':
        return `Navigation to: ${event.payload.target}`;
      case 'PANEL_SWITCHED':
        return `Panel switched to ${event.payload.panel}`;
      case 'ZEN_MODE_TOGGLED':
        return `Zen mode ${event.payload.enabled ? 'enabled' : 'disabled'}`;
      default:
        return `Unknown event`;
    }
  }
}

// Singleton instance
export const eventBus = new EventBusImpl();

// Convenience emit functions
export const emitSelectionChanged = (text: string, start: number, end: number) => {
  eventBus.emit({ type: 'SELECTION_CHANGED', payload: { text, start, end } });
};

export const emitCursorMoved = (position: number, scene: string | null) => {
  eventBus.emit({ type: 'CURSOR_MOVED', payload: { position, scene } });
};

export const emitChapterChanged = (
  projectId: string,
  chapterId: string,
  title: string,
  metadata?: {
    issues?: { description: string; severity?: string }[];
    watchedEntities?: { name: string; reason?: string; priority?: string }[];
  },
) => {
  eventBus.emit({
    type: 'CHAPTER_CHANGED',
    payload: {
      projectId,
      chapterId,
      title,
      issues: metadata?.issues,
      watchedEntities: metadata?.watchedEntities,
    },
  });
};

export const emitChapterSwitched = (chapterId: string, title: string) => {
  eventBus.emit({ type: 'CHAPTER_SWITCHED', payload: { chapterId, title } });
};

export const emitTextChanged = (length: number, delta: number) => {
  eventBus.emit({ type: 'TEXT_CHANGED', payload: { length, delta } });
};

export const emitEditMade = (author: 'user' | 'agent', description: string) => {
  eventBus.emit({ type: 'EDIT_MADE', payload: { author, description } });
};

export const emitAnalysisCompleted = (
  section: string,
  status: 'success' | 'error' = 'success',
  detail?: string,
) => {
  eventBus.emit({ type: 'ANALYSIS_COMPLETED', payload: { section, status, detail } });
};

export const emitToolExecuted = (tool: string, success: boolean) => {
  eventBus.emit({ type: 'TOOL_EXECUTED', payload: { tool, success } });
};

export const emitNavigationRequested = (target: string, position?: number) => {
  eventBus.emit({ type: 'NAVIGATION_REQUESTED', payload: { target, position } });
};

export const emitPanelSwitched = (panel: string) => {
  eventBus.emit({ type: 'PANEL_SWITCHED', payload: { panel } });
};

export const emitZenModeToggled = (enabled: boolean) => {
  eventBus.emit({ type: 'ZEN_MODE_TOGGLED', payload: { enabled } });
};
