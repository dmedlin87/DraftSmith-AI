import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MainView } from '@/types';
import { ProjectSidebar, StoryBoard, useProjectStore } from '@/features/project';
import { EditorWorkspace } from '@/features/editor';
import { UploadLayout } from './UploadLayout';
import { type OrbStatus } from '@/features/agent';
import { useEngine } from '@/features/shared';
import { useEditorState, useEditorActions } from '@/features/core/context/EditorContext';
import { NavigationRail } from './NavigationRail';
import { EditorHeader } from './EditorHeader';
import { ToolsPanelContainer } from './ToolsPanelContainer';
import { ZenModeOverlay } from './ZenModeOverlay';
import { useLayoutStore } from './store/useLayoutStore';

/**
 * Derive orb status from engine state
 */
function deriveOrbStatus(isAnalyzing: boolean, isMagicLoading: boolean): OrbStatus {
  if (isMagicLoading) return 'writing';
  if (isAnalyzing) return 'thinking';
  return 'idle';
}

/**
 * MainLayout - Composition Shell
 * 
 * This component now acts as a pure layout coordinator.
 * All state management moved to useLayoutStore.
 * All sub-components handle their own concerns.
 */
export const MainLayout: React.FC = () => {
  // Contexts - these provide data, not UI state
  const { currentProject, getActiveChapter } = useProjectStore((state) => ({
    currentProject: state.currentProject,
    getActiveChapter: state.getActiveChapter,
  }));

  // We still need isZenMode for layout coordination, but not the full editor state
  const { isZenMode } = useEditorState();
  const { toggleZenMode } = useEditorActions();
  const { state: engineState } = useEngine();

  // Layout store for UI state
  const { activeView, isSidebarCollapsed, theme, toggleSidebar, setActiveView } = useLayoutStore((state) => ({
    activeView: state.activeView,
    isSidebarCollapsed: state.isSidebarCollapsed,
    theme: state.theme,
    toggleSidebar: state.toggleSidebar,
    setActiveView: state.setActiveView,
  }));

  const activeChapter = getActiveChapter();

  // Apply theme to document on mount and changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // If no project is selected, show Dashboard/Upload
  if (!currentProject) {
    return <UploadLayout />;
  }

  const orbStatus = deriveOrbStatus(engineState.isAnalyzing, engineState.isMagicLoading);

  return (
    <div className="flex w-full h-full bg-[var(--surface-tertiary)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      
      {/* 1. Navigation Rail - Handles its own state via useLayoutStore */}
      <NavigationRail
        isZenMode={isZenMode}
        toggleZenMode={toggleZenMode}
        orbStatus={orbStatus}
        analysisReady={Boolean(activeChapter?.lastAnalysis)}
      />

      {/* 2. Chapter Sidebar */}
      <AnimatePresence mode="wait">
        {!isSidebarCollapsed && !isZenMode && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="shrink-0 overflow-hidden"
          >
            <ProjectSidebar
              collapsed={isSidebarCollapsed}
              toggleCollapsed={toggleSidebar}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Main Content Area */}
      {activeView === MainView.STORYBOARD ? (
        <StoryBoard onSwitchToEditor={() => setActiveView(MainView.EDITOR)} />
      ) : (
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-500 ${isZenMode ? 'items-center' : ''}`}>
          <EditorHeader isZenMode={isZenMode} />
          <EditorWorkspace />
        </div>
      )}

      {/* 4. Tools Panel - Now decoupled via Container */}
      <ToolsPanelContainer isZenMode={isZenMode} />

      {/* 5. Zen Mode Overlay - Exit button and hover zones */}
      <ZenModeOverlay isZenMode={isZenMode} toggleZenMode={toggleZenMode} />
    </div>
  );
};
