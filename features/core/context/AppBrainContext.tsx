/**
 * App Brain Context
 * 
 * React context that provides unified access to all application state.
 * Aggregates EditorContext, AnalysisContext, ProjectStore, and Intelligence.
 * Single source of truth for the agent layer.
 */

import React, { createContext, useContext, useMemo, useEffect, useRef, useState } from 'react';
import { useEditor } from './EditorContext';
import { useAnalysis } from '@/features/analysis';
import { useProjectStore } from '@/features/project';
import { useManuscriptIntelligence } from '@/features/shared/hooks/useManuscriptIntelligence';
import { useThrottledValue } from '@/features/shared/hooks/useThrottledValue';
import { useLayoutStore } from '@/features/layout/store/useLayoutStore';
import {
  AppBrainState,
  AppBrainActions,
  AppBrainContext as AppBrainContextType,
  MicrophoneState,
  NavigateToTextParams,
  UpdateManuscriptParams,
  RewriteSelectionParams,
  eventBus,
  emitSelectionChanged,
  emitCursorMoved,
  emitChapterSwitched,
  createContextBuilder,
} from '@/services/appBrain';
import { MainView, SidebarTab } from '@/types';
import {
  NavigateToTextCommand,
  JumpToChapterCommand,
  JumpToSceneCommand,
} from '@/services/commands/navigation';
import { UpdateManuscriptCommand, AppendTextCommand } from '@/services/commands/editing';
import { GetCritiqueCommand, RunAnalysisCommand } from '@/services/commands/analysis';
import { QueryLoreCommand, GetCharacterInfoCommand } from '@/services/commands/knowledge';
import {
  SwitchPanelCommand,
  ToggleZenModeCommand,
  HighlightTextCommand,
  SetSelectionCommand,
} from '@/services/commands/ui';
import {
  RewriteSelectionCommand,
  ContinueWritingCommand,
} from '@/services/commands/generation';
// Types imported from @/types as needed
import { generateContinuation, rewriteText } from '@/services/gemini/agent';

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
  const { activeTab, activeView, setActiveTab } = useLayoutStore((state) => ({
    activeTab: state.activeTab,
    activeView: state.activeView,
    setActiveTab: state.setActiveTab,
  }));
  
  // Get intelligence data (this hook processes the manuscript)
  const { intelligence, hud } = useManuscriptIntelligence({
    chapterId: projectStore.activeChapterId || 'default',
    initialText: editor.currentText,
  });

  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>({
    status: 'idle',
    mode: 'voice',
    lastTranscript: null,
    error: null,
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
        activePanel: activeTab ?? SidebarTab.ANALYSIS,
        activeView: activeView === MainView.STORYBOARD ? 'storyboard' : 'editor',
        isZenMode: editor.isZenMode,
        activeHighlight: editor.activeHighlight,
        microphone: microphoneState,
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
    activeTab,
    activeView,
    editor,
    analysisCtx,
    projectStore,
    intelligence,
    hud,
    microphoneState,
  ]);

  const throttledState = useThrottledValue(state, 100);

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
      const command = new NavigateToTextCommand();
      return command.execute(params, {
        currentText: editor.currentText,
        activeChapterId: projectStore.activeChapterId,
        chapters: projectStore.chapters,
        selectChapter: projectStore.selectChapter,
        cursorPosition: editor.cursorPosition,
        scrollToPosition: editor.scrollToPosition,
        navigateToRange: editor.handleNavigateToIssue,
        intelligence,
      });
    },
    
    jumpToChapter: async (identifier: string) => {
      const command = new JumpToChapterCommand();
      return command.execute(identifier, {
        currentText: editor.currentText,
        activeChapterId: projectStore.activeChapterId,
        chapters: projectStore.chapters,
        selectChapter: projectStore.selectChapter,
        cursorPosition: editor.cursorPosition,
        scrollToPosition: editor.scrollToPosition,
        navigateToRange: editor.handleNavigateToIssue,
        intelligence,
      });
    },
    
    jumpToScene: async (sceneType: string, direction: 'next' | 'previous') => {
      const command = new JumpToSceneCommand();
      return command.execute(
        { sceneType, direction },
        {
          currentText: editor.currentText,
          activeChapterId: projectStore.activeChapterId,
          chapters: projectStore.chapters,
          selectChapter: projectStore.selectChapter,
          cursorPosition: editor.cursorPosition,
          scrollToPosition: editor.scrollToPosition,
          navigateToRange: editor.handleNavigateToIssue,
          intelligence,
        },
      );
    },
    
    scrollToPosition: (position: number) => {
      editor.scrollToPosition(position);
    },
    
    // Editing
    updateManuscript: async (params: UpdateManuscriptParams) => {
      const command = new UpdateManuscriptCommand();
      return command.execute(params, {
        currentText: editor.currentText,
        commitEdit: editor.commit,
        runExclusiveEdit,
      });
    },
    
    appendText: async (text: string, description: string) => {
      const command = new AppendTextCommand();
      return command.execute({ text, description }, {
        currentText: editor.currentText,
        commitEdit: editor.commit,
        runExclusiveEdit,
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
      const command = new GetCritiqueCommand();
      return command.execute(focus, {
        selection: editor.selectionRange,
        currentText: editor.currentText,
        setting: projectStore.currentProject?.setting,
        manuscriptIndex: projectStore.currentProject?.manuscriptIndex,
        analyzePacing: analysisCtx.analyzePacing,
        analyzeCharacters: analysisCtx.analyzeCharacters,
        analyzePlot: analysisCtx.analyzePlot,
        analyzeSetting: analysisCtx.analyzeSetting,
        runFullAnalysis: analysisCtx.runFullAnalysis,
      });
    },
    
    runAnalysis: async (section?: string) => {
      const command = new RunAnalysisCommand();
      return command.execute(section, {
        selection: editor.selectionRange,
        currentText: editor.currentText,
        setting: projectStore.currentProject?.setting,
        manuscriptIndex: projectStore.currentProject?.manuscriptIndex,
        analyzePacing: analysisCtx.analyzePacing,
        analyzeCharacters: analysisCtx.analyzeCharacters,
        analyzePlot: analysisCtx.analyzePlot,
        analyzeSetting: analysisCtx.analyzeSetting,
        runFullAnalysis: analysisCtx.runFullAnalysis,
      });
    },
    
    // UI Control (using Command Pattern)
    switchPanel: async (panel: string) => {
      const command = new SwitchPanelCommand();
      return command.execute(panel, {
        switchPanel: (p) => setActiveTab((p as SidebarTab) ?? activeTab),
        toggleZenMode: editor.toggleZenMode,
        highlightText: editor.handleNavigateToIssue,
        setSelection: editor.handleNavigateToIssue,
        isZenMode: editor.isZenMode,
        activePanel: activeTab,
      });
    },
    
    toggleZenMode: async () => {
      const command = new ToggleZenModeCommand();
      return command.execute(undefined, {
        switchPanel: (p) => setActiveTab((p as SidebarTab) ?? activeTab),
        toggleZenMode: editor.toggleZenMode,
        highlightText: editor.handleNavigateToIssue,
        setSelection: editor.handleNavigateToIssue,
        isZenMode: editor.isZenMode,
        activePanel: activeTab,
      });
    },
    
    highlightText: async (start: number, end: number, style?: string) => {
      const command = new HighlightTextCommand();
      return command.execute(
        { start, end, style: (style as 'warning' | 'error' | 'info' | 'success') || 'info' },
        {
          switchPanel: (p) => setActiveTab((p as SidebarTab) ?? activeTab),
          toggleZenMode: editor.toggleZenMode,
          highlightText: editor.handleNavigateToIssue,
          setSelection: editor.handleNavigateToIssue,
          isZenMode: editor.isZenMode,
          activePanel: activeTab,
        },
      );
    },

    setMicrophoneState: (state: Partial<MicrophoneState>) => {
      setMicrophoneState(prev => ({
        ...prev,
        ...state,
        mode: state.mode ?? prev.mode,
        status: state.status ?? prev.status,
        error: state.error ?? null,
      }));
    },

    // Knowledge
    queryLore: async (query: string) => {
      const command = new QueryLoreCommand();
      return command.execute(query, {
        lore: projectStore.currentProject?.lore,
      });
    },
    
    getCharacterInfo: async (name: string) => {
      const command = new GetCharacterInfoCommand();
      return command.execute(name, {
        lore: projectStore.currentProject?.lore,
      });
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
    
    // Generation (using Command Pattern)
    rewriteSelection: async (params: RewriteSelectionParams) => {
      const command = new RewriteSelectionCommand();
      return command.execute(
        { mode: params.mode as 'expand' | 'condense' | 'rephrase' | 'formalize' | 'casual', targetTone: params.targetTone },
        {
          selection: editor.selectionRange,
          currentText: editor.currentText,
          commitEdit: editor.commit,
          runExclusiveEdit,
          generateRewrite: async (text: string, mode: string, tone?: string) => {
            const modeMap: Record<string, string> = {
              clarify: 'Simplify',
              expand: 'Elaborate',
              condense: 'Tighten',
              rephrase: 'Rephrase',
              formalize: 'Formalize',
              casual: 'Casual',
              tone_shift: 'Tone Tuner',
            };
            const result = await rewriteText(
              text,
              modeMap[mode] || mode,
              tone,
              projectStore.currentProject?.setting
            );
            return result.result[0] || text;
          },
          generateContinuation: async (context: string) => {
            try {
              const { result } = await generateContinuation(context);
              return result;
            } catch (error) {
              console.error('[AppBrainContext] Continuation failed', error);
              return 'Unable to generate continuation right now.';
            }
          },
        },
      );
    },
    
    // Continue writing (new action)
    continueWriting: async () => {
      const command = new ContinueWritingCommand();
      return command.execute(undefined, {
        selection: editor.selectionRange,
        currentText: editor.currentText,
        commitEdit: editor.commit,
        runExclusiveEdit,
        generateRewrite: async (text: string, mode: string, tone?: string) => {
          const result = await rewriteText(
            text,
            mode,
            tone,
            projectStore.currentProject?.setting
          );
          return result.result[0] || text;
        },
        generateContinuation: async (context: string) => {
          try {
            const { result } = await generateContinuation(context);
            return result;
          } catch (error) {
            console.error('[AppBrainContext] Continuation failed', error);
            return 'Unable to generate continuation right now.';
          }
        },
      });
    },
  }), [
    editor,
    analysisCtx,
    projectStore,
    intelligence,
    activeTab,
    setActiveTab,
    setMicrophoneState,
  ]);

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
    state: throttledState,
    actions,
    context: contextBuilders,
    subscribe: eventBus.subscribe.bind(eventBus),
    subscribeAll: eventBus.subscribeAll.bind(eventBus),
  }), [throttledState, actions, contextBuilders]);

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
