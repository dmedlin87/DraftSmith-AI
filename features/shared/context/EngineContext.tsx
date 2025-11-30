import React, { createContext, useContext, useState, useCallback } from 'react';
import { useEditor } from './EditorContext';

import { useProjectStore } from '@/features/project';
import { useQuillAIEngine, type PendingDiff } from '../hooks/useDraftSmithEngine';
import { useManuscriptIndexer } from '../hooks/useManuscriptIndexer';
import { Contradiction } from '@/types/schema';

/**
 * EngineContext
 * 
 * Provides global access to the AI Engine (Analysis, Magic Editor, Agents)
 * eliminating prop drilling through layout components.
 * 
 * Must be wrapped inside ManuscriptProvider (depends on currentText).
 */

export interface EngineState {
  isAnalyzing: boolean;
  analysisError?: string | null;
  analysisWarning?: string | null;
  magicVariations: string[];
  activeMagicMode?: string | null;
  magicHelpResult?: string;
  magicHelpType?: 'Explain' | 'Thesaurus' | null;
  isMagicLoading: boolean;
  magicError?: string | null;
  pendingDiff: PendingDiff | null;
}

export interface EngineActions {
  runAnalysis: () => void;
  cancelAnalysis: () => void;
  handleRewrite: (mode: string, tone?: string) => void;
  handleHelp: (type: 'Explain' | 'Thesaurus') => void;
  applyVariation: (text: string) => void;
  closeMagicBar: () => void;
  handleAgentAction: (action: string, params: any) => Promise<string>;
  acceptDiff: () => void;
  rejectDiff: () => void;
}

export interface EngineContextValue {
  state: EngineState;
  actions: EngineActions;
  contradictions: Contradiction[];
}

const EngineContext = createContext<EngineContextValue | undefined>(undefined);

export const EngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentText, commit, selectionRange, clearSelection } = useEditor();

  const { 
    currentProject, 
    activeChapterId, 
    updateChapterAnalysis, 
    updateProjectLore 
  } = useProjectStore((state) => ({
    currentProject: state.currentProject,
    activeChapterId: state.activeChapterId,
    updateChapterAnalysis: state.updateChapterAnalysis,
    updateProjectLore: state.updateProjectLore,
  }));

  // Initialize the Quill AI Engine
  const engine = useQuillAIEngine({
    getCurrentText: () => currentText,
    currentProject,
    activeChapterId,
    updateChapterAnalysis,
    updateProjectLore,
    commit,
    selectionRange,
    clearSelection
  });

  // Background Indexing for contradictions
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  
  const handleContradictions = useCallback((c: Contradiction[]) => {
    setContradictions(prev => [...prev, ...c]);
  }, []);

  useManuscriptIndexer(currentText, activeChapterId, handleContradictions);

  const value: EngineContextValue = {
    state: engine.state,
    actions: engine.actions,
    contradictions
  };

  return (
    <EngineContext.Provider value={value}>
      {children}
    </EngineContext.Provider>
  );
};

export const useEngine = (): EngineContextValue => {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return context;
};

export default EngineContext;
