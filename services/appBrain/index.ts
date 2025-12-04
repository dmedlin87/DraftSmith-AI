import React, { createContext, useContext, useMemo } from 'react';

import { useEditor } from '@/features/core/context/EditorContext';
import { useEngine } from '@/features/core/context/EngineContext';
import { useProjectStore } from '@/features/project';
import { useLayoutStore } from '@/features/layout/store/useLayoutStore';
import { useThrottledValue } from '@/features/shared/hooks/useThrottledValue';
import { MainView, SidebarTab } from '@/types';

import { buildCompressedContext, buildNavigationContext, buildEditingContext, createContextBuilder } from './contextBuilder';
import type { AppBrainContext, AppBrainState } from './types';

// Type exports
export * from './types';

// Event system
export {
  eventBus,
  emitSelectionChanged,
  emitCursorMoved,
  emitChapterChanged,
  emitChapterSwitched,
  emitTextChanged,
  emitEditMade,
  emitAnalysisCompleted,
  emitToolExecuted,
  emitNavigationRequested,
  emitPanelSwitched,
  emitZenModeToggled,
} from './eventBus';

export { startAppBrainEventObserver } from './eventObserver';

// Context builders
export {
  buildAgentContext,
  buildCompressedContext,
  buildNavigationContext,
  buildEditingContext,
  createContextBuilder,
  buildAgentContextWithMemory,
} from './contextBuilder';

// Enhancement 2A: Adaptive Context
export {
  buildAdaptiveContext,
  selectBudget,
  estimateTokens,
  DEFAULT_BUDGET,
  VOICE_MODE_BUDGET,
  EDITING_BUDGET,
  DEEP_ANALYSIS_BUDGET,
  // v1 Enhancement: Context Profiles & Model-aware budgets
  getContextBudgetForModel,
  selectContextProfile,
  PROFILE_ALLOCATIONS,
  type ContextProfile,
  type AdaptiveContextOptions,
  // Smartness Upgrade: Scene-aware memory filtering
  getSceneContextFromState,
  buildSceneAwareRelevance,
  type SceneContext,
} from './adaptiveContext';

// v1 Enhancement: Smart Context (unified entry point)
export { getSmartAgentContext, type SmartContextOptions } from './contextBuilder';

// Enhancement 2B: Context Streaming
export {
  ContextStreamer,
  getContextStreamer,
  resetContextStreamer,
  createStreamingSession,
  hasSignificantContextChange,
} from './contextStreamer';

// Enhancement 2C: Cross-Chapter Context
export { buildCrossChapterContext, formatCrossChapterContext } from './crossChapterContext';

// Smartness Upgrade: Intelligence-Memory Bridge
export {
  analyzeIntelligenceAgainstMemory,
  getHighPriorityConflicts,
  formatConflictsForPrompt,
  type IntelligenceConflict,
  type BridgeAnalysisResult,
  type BridgeOptions,
} from './intelligenceMemoryBridge';

// Smartness Upgrade: Proactive Thinker
export {
  ProactiveThinker,
  getProactiveThinker,
  startProactiveThinker,
  stopProactiveThinker,
  resetProactiveThinker,
  type ThinkingResult,
  type ThinkerConfig,
  type ThinkerState,
} from './proactiveThinker';

export interface AppBrainValue {
  state: AppBrainState;
  context: AppBrainContext;
}

const AppBrainReactContext = createContext<AppBrainValue | null>(null);

export const AppBrainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const projectStore = useProjectStore();
  const editor = useEditor();
  const engine = useEngine();
  const { activeTab, activeView } = useLayoutStore((state) => ({
    activeTab: state.activeTab,
    activeView: state.activeView,
  }));

  const brainState = useMemo<AppBrainState>(() => {
    const activeChapter = projectStore.chapters.find(
      (chapter) => chapter.id === projectStore.activeChapterId,
    );

    return {
      manuscript: {
        projectId: projectStore.currentProject?.id ?? null,
        projectTitle: projectStore.currentProject?.title ?? '',
        chapters: projectStore.chapters,
        activeChapterId: projectStore.activeChapterId,
        currentText: editor.currentText,
        branches: editor.branches,
        activeBranchId: editor.activeBranchId,
        setting: projectStore.currentProject?.setting,
      },
      intelligence: {
        hud: null,
        full: null,
        entities: null,
        timeline: null,
        style: null,
        heatmap: null,
        lastProcessedAt: 0,
      },
      analysis: {
        result: activeChapter?.lastAnalysis ?? null,
        status: {
          pacing: engine.state.isAnalyzing ? 'loading' : 'idle',
          characters: engine.state.isAnalyzing ? 'loading' : 'idle',
          plot: engine.state.isAnalyzing ? 'loading' : 'idle',
          setting: engine.state.isAnalyzing ? 'loading' : 'idle',
        },
        inlineComments: editor.inlineComments,
      },
      lore: {
        characters: projectStore.currentProject?.lore?.characters ?? [],
        worldRules: projectStore.currentProject?.lore?.worldRules ?? [],
        manuscriptIndex: projectStore.currentProject?.manuscriptIndex ?? null,
      },
      ui: {
        cursor: {
          position: editor.cursorPosition,
          scene: null,
          paragraph: null,
        },
        selection: editor.selectionRange,
        activePanel: activeTab ?? SidebarTab.ANALYSIS,
        activeView: activeView === MainView.STORYBOARD ? 'storyboard' : 'editor',
        isZenMode: editor.isZenMode,
        activeHighlight: editor.activeHighlight,
        microphone: {
          status: 'idle',
          mode: 'voice',
          lastTranscript: null,
          error: null,
        },
      },
      session: {
        chatHistory: [],
        currentPersona: null,
        pendingToolCalls: [],
        lastAgentAction: null,
        isProcessing: engine.state.isAnalyzing,
      },
    };
  }, [
    activeTab,
    activeView,
    editor,
    engine.state.isAnalyzing,
    projectStore,
  ]);

  const throttledState = useThrottledValue(brainState, 100);

  const contextBuilders = useMemo(() => createContextBuilder(() => brainState), [brainState]);

  const context: AppBrainContext = useMemo(
    () => ({
      getAgentContext: contextBuilders.getAgentContext,
      getAgentContextWithMemory: contextBuilders.getAgentContextWithMemory,
      getCompressedContext: () => buildCompressedContext(brainState),
      getNavigationContext: () => buildNavigationContext(brainState),
      getEditingContext: () => buildEditingContext(brainState),
      getRecentEvents: contextBuilders.getRecentEvents,
    }),
    [brainState, contextBuilders],
  );

  const value = useMemo<AppBrainValue>(
    () => ({
      state: throttledState,
      context,
    }),
    [throttledState, context],
  );

    return React.createElement(
      AppBrainReactContext.Provider,
      { value },
      children,
    );
  };

export const useAppBrain = (): AppBrainValue => {
  const ctx = useContext(AppBrainReactContext);
  if (!ctx) {
    throw new Error('useAppBrain must be used within an AppBrainProvider');
  }
  return ctx;
};

export const createEmptyAppBrainState = (): AppBrainState => ({
  manuscript: {
    projectId: null,
    projectTitle: '',
    chapters: [],
    activeChapterId: null,
    currentText: '',
    branches: [],
    activeBranchId: null,
    setting: undefined,
  },
  intelligence: {
    hud: null,
    full: null,
    entities: null,
    timeline: null,
    style: null,
    heatmap: null,
    lastProcessedAt: 0,
  },
  analysis: {
    result: null,
    status: {
      pacing: 'idle',
      characters: 'idle',
      plot: 'idle',
      setting: 'idle',
    },
    inlineComments: [],
  },
  lore: {
    characters: [],
    worldRules: [],
    manuscriptIndex: null,
  },
  ui: {
    cursor: {
      position: 0,
      scene: null,
      paragraph: null,
    },
    selection: null,
    activePanel: 'chat',
    activeView: 'editor',
    isZenMode: false,
    activeHighlight: null,
    microphone: {
      status: 'idle',
      mode: 'text',
      lastTranscript: null,
      error: null,
    },
  },
  session: {
    chatHistory: [],
    currentPersona: null,
    pendingToolCalls: [],
    lastAgentAction: null,
    isProcessing: false,
  },
});

export type { AppBrainContext, AppBrainState };

