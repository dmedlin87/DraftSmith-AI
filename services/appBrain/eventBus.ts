/**
 * Event Bus
 * 
 * Pub/sub system for application-wide events.
 * Enables agent to react to user actions and vice versa.
 */

import { AppEvent, EventHandler } from './types';

const MAX_HISTORY = 100;

class EventBusImpl {
  private listeners: Map<AppEvent['type'], Set<EventHandler>> = new Map();
  private globalListeners: Set<EventHandler> = new Set();
  private history: AppEvent[] = [];

  /**
   * Emit an event to all subscribers
   */
  emit(event: AppEvent): void {
    // Add to history
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(event);
        } catch (e) {
          console.error(`[EventBus] Listener error for ${event.type}:`, e);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener(event);
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
      case 'CHAPTER_SWITCHED':
        return `Switched to "${event.payload.title}"`;
      case 'TEXT_CHANGED':
        return `Text ${event.payload.delta > 0 ? 'added' : 'removed'} (${Math.abs(event.payload.delta)} chars)`;
      case 'ANALYSIS_COMPLETED':
        return `Analysis complete: ${event.payload.section}`;
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

export const emitChapterSwitched = (chapterId: string, title: string) => {
  eventBus.emit({ type: 'CHAPTER_SWITCHED', payload: { chapterId, title } });
};

export const emitTextChanged = (length: number, delta: number) => {
  eventBus.emit({ type: 'TEXT_CHANGED', payload: { length, delta } });
};

export const emitEditMade = (author: 'user' | 'agent', description: string) => {
  eventBus.emit({ type: 'EDIT_MADE', payload: { author, description } });
};

export const emitToolExecuted = (tool: string, success: boolean) => {
  eventBus.emit({ type: 'TOOL_EXECUTED', payload: { tool, success } });
};

export const emitNavigationRequested = (target: string, position?: number) => {
  eventBus.emit({ type: 'NAVIGATION_REQUESTED', payload: { target, position } });
};
