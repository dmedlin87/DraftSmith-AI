import React, { useMemo } from 'react';
import { useProjectStore } from '@/features/project';
import { useEditorState, useEditorActions } from '@/features/core/context/EditorContext';
import { useEngine } from '@/features/shared';
import { ToolsPanel } from './ToolsPanel';

interface ToolsPanelContainerProps {
  isZenMode: boolean;
}

export const ToolsPanelContainer: React.FC<ToolsPanelContainerProps> = ({ isZenMode }) => {
  // 1. Project Data
  const { currentProject, chapters, getActiveChapter } = useProjectStore((state) => ({
    currentProject: state.currentProject,
    chapters: state.chapters,
    getActiveChapter: state.getActiveChapter,
  }));
  const activeChapter = getActiveChapter();

  // 2. Editor State
  const { currentText, selectionRange, history, editor } = useEditorState();
  const { restore } = useEditorActions();

  // 3. Engine State
  const { state: engineState, actions: engineActions } = useEngine();

  // 4. Derived Context (Memoized)
  const editorContext = useMemo(() => ({
    cursorPosition: editor?.state.selection.from || 0,
    selection: selectionRange,
    totalLength: currentText.length
  }), [editor?.state.selection.from, selectionRange, currentText.length]);

  return (
    <ToolsPanel
      isZenMode={isZenMode}
      currentText={currentText}
      editorContext={editorContext}
      projectId={currentProject?.id}
      lore={currentProject?.lore}
      chapters={chapters}
      analysis={activeChapter?.lastAnalysis}
      history={history}
      isAnalyzing={engineState.isAnalyzing}
      analysisWarning={engineState.analysisWarning}
      onAgentAction={engineActions.handleAgentAction}
      onRestore={restore}
    />
  );
};
