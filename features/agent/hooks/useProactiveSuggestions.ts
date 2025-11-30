/**
 * useProactiveSuggestions Hook
 * 
 * Monitors chapter switches and surfaces relevant memory-based suggestions.
 * Integrates with the event bus to respond to navigation events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { eventBus } from '@/services/appBrain';
import { 
  ProactiveSuggestion, 
  generateSuggestionsForChapter,
  getImportantReminders,
} from '@/services/memory/proactive';

export interface UseProactiveSuggestionsOptions {
  /** Project ID to fetch suggestions for */
  projectId: string | null;
  /** Whether to show suggestions (can be disabled by user preference) */
  enabled?: boolean;
  /** Maximum number of suggestions to show */
  maxSuggestions?: number;
  /** How long to show suggestions before auto-dismiss (ms), 0 = never */
  autoDismissMs?: number;
}

export interface UseProactiveSuggestionsResult {
  /** Current active suggestions */
  suggestions: ProactiveSuggestion[];
  /** Dismiss a specific suggestion */
  dismissSuggestion: (id: string) => void;
  /** Dismiss all suggestions */
  dismissAll: () => void;
  /** Manually trigger suggestion check */
  checkForSuggestions: (chapterId: string, chapterTitle: string, content?: string) => Promise<void>;
  /** Get reminders (stalled goals, unresolved issues) */
  getReminders: () => Promise<ProactiveSuggestion[]>;
}

export function useProactiveSuggestions(
  options: UseProactiveSuggestionsOptions
): UseProactiveSuggestionsResult {
  const { 
    projectId, 
    enabled = true, 
    maxSuggestions = 5,
    autoDismissMs = 30000, // 30 seconds default
  } = options;

  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const dismissTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Dismiss a single suggestion
  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    
    // Clear any auto-dismiss timer
    const timer = dismissTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, []);

  // Dismiss all suggestions
  const dismissAll = useCallback(() => {
    setSuggestions([]);
    
    // Clear all timers
    dismissTimersRef.current.forEach(timer => clearTimeout(timer));
    dismissTimersRef.current.clear();
  }, []);

  // Set up auto-dismiss for a suggestion
  const setupAutoDismiss = useCallback((suggestion: ProactiveSuggestion) => {
    if (autoDismissMs <= 0) return;
    
    const timer = setTimeout(() => {
      dismissSuggestion(suggestion.id);
    }, autoDismissMs);
    
    dismissTimersRef.current.set(suggestion.id, timer);
  }, [autoDismissMs, dismissSuggestion]);

  // Check for suggestions for a specific chapter
  const checkForSuggestions = useCallback(async (
    chapterId: string, 
    chapterTitle: string, 
    content?: string
  ) => {
    if (!projectId || !enabled) return;
    
    try {
      const newSuggestions = await generateSuggestionsForChapter(projectId, {
        chapterId,
        chapterTitle,
        content,
      });
      
      if (newSuggestions.length > 0) {
        // Merge with existing (avoid duplicates by source ID)
        setSuggestions(prev => {
          const existing = new Set(prev.map(s => s.source.id));
          const unique = newSuggestions.filter(s => !existing.has(s.source.id));
          const merged = [...prev, ...unique].slice(0, maxSuggestions);
          
          // Set up auto-dismiss for new ones
          unique.forEach(setupAutoDismiss);
          
          return merged;
        });
      }
    } catch (error) {
      console.warn('[useProactiveSuggestions] Failed to generate suggestions:', error);
    }
  }, [projectId, enabled, maxSuggestions, setupAutoDismiss]);

  // Get reminders (can be called manually)
  const getReminders = useCallback(async (): Promise<ProactiveSuggestion[]> => {
    if (!projectId) return [];
    
    try {
      return await getImportantReminders(projectId);
    } catch (error) {
      console.warn('[useProactiveSuggestions] Failed to get reminders:', error);
      return [];
    }
  }, [projectId]);

  // Subscribe to chapter switch events
  useEffect(() => {
    if (!enabled || !projectId) return;
    
    const unsubscribe = eventBus.subscribe('CHAPTER_SWITCHED', async (event) => {
      // Type guard for CHAPTER_SWITCHED payload
      if (event.type === 'CHAPTER_SWITCHED') {
        const { chapterId, title } = event.payload as { chapterId: string; title: string };
        await checkForSuggestions(chapterId, title);
      }
    });
    
    return () => {
      unsubscribe();
      // Clean up all timers
      dismissTimersRef.current.forEach(timer => clearTimeout(timer));
      dismissTimersRef.current.clear();
    };
  }, [enabled, projectId, checkForSuggestions]);

  // Clear suggestions when project changes
  useEffect(() => {
    dismissAll();
  }, [projectId, dismissAll]);

  return {
    suggestions,
    dismissSuggestion,
    dismissAll,
    checkForSuggestions,
    getReminders,
  };
}

export default useProactiveSuggestions;
