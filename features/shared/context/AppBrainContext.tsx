/**
 * App Brain Context
 * 
 * React context that provides unified access to all application state.
 * Aggregates EditorContext, AnalysisContext, ProjectStore, and Intelligence.
 * Single source of truth for the agent layer.
 */

import React, { createContext, useContext, useMemo, useEffect, useRef } from 'react';
import { useEditor } from './EditorContext';
import { useAnalysis } from '@/features/analysis/context/AnalysisContext';
import { useProjectStore } from '@/features/project';
import { useManuscriptIntelligence } from '@/features/shared/hooks/useManuscriptIntelligence';
import {
  AppBrainState,
  AppBrainActions,
  AppBrainContext as AppBrainContextType,
  NavigateToTextParams,
  UpdateManuscriptParams,
  RewriteSelectionParams,
  eventBus,
  emitSelectionChanged,
  emitCursorMoved,
  emitChapterSwitched,
  createContextBuilder,
} from '@/services/appBrain';
// Types imported from @/types as needed
import { rewriteText } from '@/services/gemini/agent';

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AppBrainValue {
  /** Current unified state */
  state: AppBrainState;
  
  /** Actions that the agent can execute */
  actions: AppBrainActions;
  
  /** Context builders for AI prompts */
  context: AppBrainContextType;
  
  /** Subscribe to events */
  subscribe: typeof eventBus.subscribe;
  
  /** Subscribe to all events */
  subscribeAll: typeof eventBus.subscribeAll;
}

const AppBrainContext = createContext<AppBrainValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export const AppBrainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Pull from existing contexts
  const editor = useEditor();
  const analysisCtx = useAnalysis();
  const projectStore = useProjectStore();
  
  // Get intelligence data (this hook processes the manuscript)
  const { intelligence, hud } = useManuscriptIntelligence({
    chapterId: projectStore.activeChapterId || 'default',
    initialText: editor.currentText,
  });
  
  // Track previous values for events
  const prevSelectionRef = useRef(editor.selectionRange);
  const prevCursorRef = useRef(editor.cursorPosition);
  const prevChapterRef = useRef(projectStore.activeChapterId);

  // Emit events on state changes
  useEffect(() => {
    if (editor.selectionRange !== prevSelectionRef.current && editor.selectionRange) {
      emitSelectionChanged(
        editor.selectionRange.text,
        editor.selectionRange.start,
        editor.selectionRange.end
      );
    }
    prevSelectionRef.current = editor.selectionRange;
  }, [editor.selectionRange]);

  useEffect(() => {
    if (editor.cursorPosition !== prevCursorRef.current) {
      const scene = hud?.situational.currentScene?.type || null;
      emitCursorMoved(editor.cursorPosition, scene);
    }
    prevCursorRef.current = editor.cursorPosition;
  }, [editor.cursorPosition, hud]);

  useEffect(() => {
    if (projectStore.activeChapterId !== prevChapterRef.current && projectStore.activeChapterId) {
      const chapter = projectStore.chapters.find(c => c.id === projectStore.activeChapterId);
      emitChapterSwitched(projectStore.activeChapterId, chapter?.title || 'Unknown');
    }
    prevChapterRef.current = projectStore.activeChapterId;
  }, [projectStore.activeChapterId, projectStore.chapters]);

  // Build unified state
  const state = useMemo<AppBrainState>(() => {
    const activeChapter = projectStore.getActiveChapter();
    
    return {
      manuscript: {
        projectId: projectStore.currentProject?.id || null,
        projectTitle: projectStore.currentProject?.title || '',
        chapters: projectStore.chapters,
        activeChapterId: projectStore.activeChapterId,
        currentText: editor.currentText,
        branches: editor.branches,
        activeBranchId: editor.activeBranchId,
        setting: projectStore.currentProject?.setting,
      },
      intelligence: {
        hud: hud || null,
        full: intelligence || null,
        entities: intelligence?.entities || null,
        timeline: intelligence?.timeline || null,
        style: intelligence?.style || null,
        heatmap: intelligence?.heatmap || null,
        lastProcessedAt: intelligence?.hud?.lastFullProcess || 0,
      },
      analysis: {
        result: analysisCtx.analysis,
        status: analysisCtx.analysisStatus,
        inlineComments: editor.inlineComments,
      },
      lore: {
        characters: projectStore.currentProject?.lore?.characters || [],
        worldRules: projectStore.currentProject?.lore?.worldRules || [],
        manuscriptIndex: projectStore.currentProject?.manuscriptIndex || null,
      },
      ui: {
        cursor: {
          position: editor.cursorPosition,
          scene: hud?.situational.currentScene?.type || null,
          paragraph: hud?.situational.currentParagraph?.type || null,
        },
        selection: editor.selectionRange,
        activePanel: 'chat', // TODO: Connect to actual sidebar state
        activeView: 'editor' as const, // TODO: Connect to actual view state
        isZenMode: editor.isZenMode,
        activeHighlight: editor.activeHighlight,
      },
      session: {
        chatHistory: [],
        currentPersona: null,
        pendingToolCalls: [],
        lastAgentAction: null,
        isProcessing: false,
      },
    };
  }, [
    editor,
    analysisCtx,
    projectStore,
    intelligence,
    hud,
  ]);

  const editMutexRef = useRef<Promise<unknown> | null>(null);

  const runExclusiveEdit = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const queue = editMutexRef.current ?? Promise.resolve();
    const next = queue.then(fn);
    editMutexRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  // Build actions
  const actions = useMemo<AppBrainActions>(() => ({
    // Navigation
    navigateToText: async (params: NavigateToTextParams) => {
      const { query, searchType = 'fuzzy', character, chapter } = params;
      
      // Get text to search
      let searchText = editor.currentText;
      let targetChapterId = projectStore.activeChapterId;
      
      // If specific chapter requested, find it
      if (chapter) {
        const targetChapter = projectStore.chapters.find(
          c => c.title.toLowerCase().includes(chapter.toLowerCase()) ||
               c.order.toString() === chapter
        );
        if (targetChapter) {
          searchText = targetChapter.content;
          targetChapterId = targetChapter.id;
        }
      }
      
      // Search based on type
      let foundIndex = -1;
      const lowerQuery = query.toLowerCase();
      
      if (searchType === 'exact') {
        foundIndex = searchText.indexOf(query);
      } else if (searchType === 'dialogue' && character) {
        // Search for character dialogue
        const dialoguePattern = new RegExp(
          `[""]([^""]*${query}[^""]*)[""]\\s*(?:said|replied|asked|whispered|shouted)?\\s*${character}|` +
          `${character}\\s*(?:said|replied|asked|whispered|shouted)?\\s*[""]([^""]*${query}[^""]*)[""]`,
          'i'
        );
        const match = searchText.match(dialoguePattern);
        if (match) {
          foundIndex = match.index || -1;
        }
      } else if (searchType === 'character_mention' && character) {
        // Find character mentions
        const mentionPattern = new RegExp(character, 'gi');
        const match = mentionPattern.exec(searchText);
        if (match) {
          foundIndex = match.index;
        }
      } else {
        // Fuzzy search - find case-insensitive
        foundIndex = searchText.toLowerCase().indexOf(lowerQuery);
      }
      
      if (foundIndex === -1) {
        return `Could not find "${query}" in the manuscript.`;
      }
      
      // Switch chapter if needed
      if (targetChapterId !== projectStore.activeChapterId) {
        projectStore.selectChapter(targetChapterId!);
      }
      
      // Navigate to the found text
      const endIndex = foundIndex + query.length;
      editor.handleNavigateToIssue(foundIndex, endIndex);
      
      const context = searchText.substring(
        Math.max(0, foundIndex - 30),
        Math.min(searchText.length, foundIndex + query.length + 30)
      );
      
      return `Found at position ${foundIndex}. Context: "...${context}..."`;
    },
    
    jumpToChapter: async (identifier: string) => {
      const chapter = projectStore.chapters.find(
        c => c.title.toLowerCase().includes(identifier.toLowerCase()) ||
             (c.order + 1).toString() === identifier ||
             c.order.toString() === identifier
      );
      
      if (!chapter) {
        return `Could not find chapter "${identifier}". Available: ${projectStore.chapters.map(c => c.title).join(', ')}`;
      }
      
      projectStore.selectChapter(chapter.id);
      return `Switched to "${chapter.title}"`;
    },
    
    jumpToScene: async (sceneType: string, direction: 'next' | 'previous') => {
      if (!intelligence?.structural?.scenes) {
        return 'No scene data available. Try running analysis first.';
      }
      
      const scenes = intelligence.structural.scenes;
      const cursorPos = editor.cursorPosition;
      
      let targetScene;
      if (direction === 'next') {
        targetScene = scenes.find(s => 
          s.startOffset > cursorPos && 
          (sceneType === 'any' || s.type === sceneType)
        );
      } else {
        const candidates = scenes.filter(s => 
          s.endOffset < cursorPos && 
          (sceneType === 'any' || s.type === sceneType)
        );
        targetScene = candidates[candidates.length - 1];
      }
      
      if (!targetScene) {
        return `No ${direction} ${sceneType} scene found.`;
      }
      
      editor.scrollToPosition(targetScene.startOffset);
      return `Jumped to ${targetScene.type} scene at position ${targetScene.startOffset}`;
    },
    
    scrollToPosition: (position: number) => {
      editor.scrollToPosition(position);
    },
    
    // Editing
    updateManuscript: async (params: UpdateManuscriptParams) => {
      return runExclusiveEdit(async () => {
        const { searchText, replacementText, description } = params;
        
        if (!editor.currentText.includes(searchText)) {
          return `Error: Could not find "${searchText.slice(0, 50)}..." in the document.`;
        }
        
        const newText = editor.currentText.replace(searchText, replacementText);
        editor.commit(newText, description, 'Agent');
        
        return `Successfully updated: ${description}`;
      });
    },
    
    appendText: async (text: string, description: string) => {
      return runExclusiveEdit(async () => {
        const newText = editor.currentText + '\n\n' + text;
        editor.commit(newText, description, 'Agent');
        return `Appended text: ${description}`;
      });
    },
    
    undo: async () => {
      return runExclusiveEdit(async () => {
        const success = editor.undo();
        return success ? 'Undid the last change' : 'Nothing to undo';
      });
    },
    
    redo: async () => {
      return runExclusiveEdit(async () => {
        const success = editor.redo();
        return success ? 'Redid the last change' : 'Nothing to redo';
      });
    },
    
    // Analysis
    getCritiqueForSelection: async (focus?: string) => {
      const selection = editor.selectionRange;
      if (!selection) {
        return 'No text selected. Please select text to critique.';
      }
      
      // This would call the actual critique service
      return `Critique for: "${selection.text.slice(0, 50)}..." [Focus: ${focus || 'all'}]
      
To get detailed feedback, the selection would be sent to the analysis service.`;
    },
    
    runAnalysis: async (section?: string) => {
      const text = editor.currentText;
      const setting = projectStore.currentProject?.setting;
      
      if (section === 'pacing') {
        await analysisCtx.analyzePacing(text, setting);
        return 'Pacing analysis complete';
      } else if (section === 'characters') {
        await analysisCtx.analyzeCharacters(text);
        return 'Character analysis complete';
      } else if (section === 'plot') {
        await analysisCtx.analyzePlot(text);
        return 'Plot analysis complete';
      } else if (section === 'setting' && setting) {
        await analysisCtx.analyzeSetting(text, setting);
        return 'Setting analysis complete';
      } else {
        await analysisCtx.runFullAnalysis(text, setting);
        return 'Full analysis complete';
      }
    },
    
    // UI Control
    switchPanel: (panel: string) => {
      // TODO: Connect to actual panel switching
      console.log(`[AppBrain] Switch panel to: ${panel}`);
    },
    
    toggleZenMode: () => {
      editor.toggleZenMode();
    },
    
    highlightText: (start: number, end: number, _style?: string) => {
      editor.handleNavigateToIssue(start, end);
    },
    
    // Knowledge
    queryLore: async (query: string) => {
      const lore = projectStore.currentProject?.lore;
      if (!lore) {
        return 'No lore data available for this project.';
      }
      
      const lowerQuery = query.toLowerCase();
      
      // Search characters
      const matchingChars = lore.characters.filter(c => 
        c.name.toLowerCase().includes(lowerQuery) ||
        c.bio?.toLowerCase().includes(lowerQuery) ||
        c.arc?.toLowerCase().includes(lowerQuery)
      );
      
      // Search world rules
      const matchingRules = lore.worldRules.filter(r =>
        r.toLowerCase().includes(lowerQuery)
      );
      
      let result = '';
      if (matchingChars.length > 0) {
        result += 'Characters:\n';
        matchingChars.forEach(c => {
          result += `• ${c.name}: ${c.bio?.slice(0, 100) || 'No bio'}...\n`;
        });
      }
      if (matchingRules.length > 0) {
        result += '\nWorld Rules:\n';
        matchingRules.forEach(r => {
          result += `• ${r}\n`;
        });
      }
      
      return result || `No lore found matching "${query}"`;
    },
    
    getCharacterInfo: async (name: string) => {
      const lore = projectStore.currentProject?.lore;
      const char = lore?.characters.find(c => 
        c.name.toLowerCase() === name.toLowerCase()
      );
      
      if (!char) {
        return `Character "${name}" not found in lore.`;
      }
      
      let info = `**${char.name}**\n\n`;
      if (char.bio) info += `Bio: ${char.bio}\n\n`;
      if (char.arc) info += `Arc: ${char.arc}\n\n`;
      if (char.relationships && char.relationships.length > 0) {
        info += `Relationships: ${char.relationships.join(', ')}\n\n`;
      }
      if (char.inconsistencies && char.inconsistencies.length > 0) {
        info += `⚠️ Inconsistencies:\n`;
        char.inconsistencies.forEach(i => {
          info += `• ${i.issue}\n`;
        });
      }
      
      return info;
    },
    
    getTimelineContext: async (range: 'before' | 'after' | 'nearby') => {
      if (!intelligence?.timeline?.events) {
        return 'No timeline data available.';
      }
      
      const events = intelligence.timeline.events;
      const cursorPos = editor.cursorPosition;
      
      let relevant;
      if (range === 'before') {
        relevant = events.filter(e => e.offset < cursorPos).slice(-5);
      } else if (range === 'after') {
        relevant = events.filter(e => e.offset > cursorPos).slice(0, 5);
      } else {
        relevant = events
          .filter(e => Math.abs(e.offset - cursorPos) < 2000)
          .slice(0, 5);
      }
      
      if (relevant.length === 0) {
        return `No timeline events ${range} cursor.`;
      }
      
      let result = `Timeline events (${range}):\n`;
      relevant.forEach(e => {
        result += `• ${e.description}`;
        if (e.temporalMarker) result += ` (${e.temporalMarker})`;
        result += '\n';
      });
      
      return result;
    },
    
    // Generation
    rewriteSelection: async (params: RewriteSelectionParams) => {
      const selection = editor.selectionRange;
      if (!selection) {
        return 'No text selected for rewrite.';
      }
      
      const modeMap: Record<string, string> = {
        clarify: 'Simplify',
        expand: 'Elaborate',
        condense: 'Tighten',
        tone_shift: 'Tone Tuner',
      };
      
      const result = await rewriteText(
        selection.text,
        modeMap[params.mode] || params.mode,
        params.targetTone,
        projectStore.currentProject?.setting
      );
      
      if (result.result.length === 0) {
        return 'Could not generate rewrites.';
      }
      
      return `Rewrite options for "${selection.text.slice(0, 30)}...":\n\n` +
        result.result.map((r, i) => `${i + 1}. ${r}`).join('\n\n');
    },
  }), [editor, analysisCtx, projectStore, intelligence]);

  const stateRef = useRef<AppBrainState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Create context builders using ref-based getter to avoid stale closures
  const contextBuilders = useMemo(() => 
    createContextBuilder(() => stateRef.current),
    []
  );

  const value = useMemo<AppBrainValue>(() => ({
    state,
    actions,
    context: contextBuilders,
    subscribe: eventBus.subscribe.bind(eventBus),
    subscribeAll: eventBus.subscribeAll.bind(eventBus),
  }), [state, actions, contextBuilders]);

  return (
    <AppBrainContext.Provider value={value}>
      {children}
    </AppBrainContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Access the unified App Brain
 */
export const useAppBrain = (): AppBrainValue => {
  const context = useContext(AppBrainContext);
  if (!context) {
    throw new Error('useAppBrain must be used within AppBrainProvider');
  }
  return context;
};

/**
 * Get just the state (for components that only read)
 */
export const useAppBrainState = (): AppBrainState => {
  return useAppBrain().state;
};

/**
 * Get just the actions (for components that only act)
 */
export const useAppBrainActions = (): AppBrainActions => {
  return useAppBrain().actions;
};

/**
 * Get context builders for AI integration
 */
export const useAppBrainContext = (): AppBrainContextType => {
  return useAppBrain().context;
};
