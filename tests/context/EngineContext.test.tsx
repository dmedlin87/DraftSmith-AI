import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EngineProvider, useEngine, type EngineState, type EngineActions } from '@/features/core/context/EngineContext';

import type { Contradiction } from '@/types/schema';
import { useQuillAIEngine } from '@/features/shared/hooks/useDraftSmithEngine';
import { useManuscriptIndexer } from '@/features/shared/hooks/useManuscriptIndexer';
import { useEditor } from '@/features/core/context/EditorContext';

import { useProjectStore } from '@/features/project';
import type { Mock } from 'vitest';

vi.mock('@/features/core/context/EditorContext', () => ({
  useEditor: vi.fn()
}));

vi.mock('@/features/project', () => ({
  useProjectStore: vi.fn()
}));

let engineState: EngineState;
let mockActions: EngineActions;
let indexerHandler: ((contradictions: Contradiction[]) => void) | undefined;

vi.mock('@/features/shared/hooks/useDraftSmithEngine', () => ({
  useQuillAIEngine: vi.fn(() => ({ state: engineState, actions: mockActions }))
}));

vi.mock('@/features/shared/hooks/useManuscriptIndexer', () => ({
  useManuscriptIndexer: vi.fn((_, __, handler: (contradictions: Contradiction[]) => void) => {
    indexerHandler = handler;
  })
}));

const mockUseEditor = useEditor as unknown as Mock;
const mockUseProjectStore = useProjectStore as unknown as Mock;
const mockUseQuillAIEngine = useQuillAIEngine as unknown as Mock;
const mockUseManuscriptIndexer = useManuscriptIndexer as unknown as Mock;

const EngineConsumer = () => {
  const { state, actions, contradictions } = useEngine();
  return (
    <div>
      <span data-testid="is-analyzing">{state.isAnalyzing ? 'true' : 'false'}</span>
      <span data-testid="magic-error">{state.magicError || ''}</span>
      <span data-testid="contradictions-count">{contradictions.length}</span>
      <button data-testid="run-analysis" onClick={actions.runAnalysis}>Run</button>
    </div>
  );
};

beforeEach(() => {
  engineState = {
    isAnalyzing: false,
    analysisError: null,
    analysisWarning: null,
    magicVariations: [],
    activeMagicMode: null,
    magicHelpResult: undefined,
    magicHelpType: null,
    isMagicLoading: false,
    magicError: null,
    pendingDiff: null
  };

  mockActions = {
    runAnalysis: vi.fn(),
    runSelectionAnalysis: vi.fn(),
    cancelAnalysis: vi.fn(),
    handleRewrite: vi.fn(),
    handleHelp: vi.fn(),
    applyVariation: vi.fn(),
    closeMagicBar: vi.fn(),
    handleAgentAction: vi.fn(),
    acceptDiff: vi.fn(),
    rejectDiff: vi.fn()
  };

  indexerHandler = undefined;

  mockUseEditor.mockReturnValue({
    currentText: 'Hello world',
    commit: vi.fn(),
    selectionRange: null,
    clearSelection: vi.fn()
  });

  mockUseProjectStore.mockReturnValue({
    currentProject: { id: 'project-1' },
    activeChapterId: 'chapter-1',
    updateChapterAnalysis: vi.fn(),
    updateProjectLore: vi.fn()
  });

  mockUseQuillAIEngine.mockClear();
  mockUseManuscriptIndexer.mockClear();
});

describe('EngineContext', () => {
  it('throws when used outside provider', () => {
    const Consumer = () => {
      useEngine();
      return null;
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrowError('useEngine must be used within an EngineProvider');
    consoleSpy.mockRestore();
  });

  it('provides engine state and actions from the hook', () => {
    render(
      <EngineProvider>
        <EngineConsumer />
      </EngineProvider>
    );

    expect(screen.getByTestId('is-analyzing')).toHaveTextContent('false');

    fireEvent.click(screen.getByTestId('run-analysis'));
    expect(mockActions.runAnalysis).toHaveBeenCalled();
  });

  it('updates when engine state changes', () => {
    const { rerender } = render(
      <EngineProvider>
        <EngineConsumer />
      </EngineProvider>
    );

    expect(screen.getByTestId('magic-error')).toHaveTextContent('');

    engineState = {
      ...engineState,
      isAnalyzing: true,
      magicError: 'failed'
    };

    rerender(
      <EngineProvider>
        <EngineConsumer />
      </EngineProvider>
    );

    expect(screen.getByTestId('is-analyzing')).toHaveTextContent('true');
    expect(screen.getByTestId('magic-error')).toHaveTextContent('failed');
  });

  it('collects contradictions from the manuscript indexer', async () => {
    render(
      <EngineProvider>
        <EngineConsumer />
      </EngineProvider>
    );

    expect(mockUseManuscriptIndexer).toHaveBeenCalled();
    expect(screen.getByTestId('contradictions-count')).toHaveTextContent('0');

    const contradiction: Contradiction = {
      type: 'character_attribute',
      characterName: 'Alice',
      attribute: 'eye_color',
      originalValue: 'blue',
      originalChapterId: 'chapter-1',
      newValue: 'green',
      newChapterId: 'chapter-1',
      position: 10
    };

    await act(async () => {
      indexerHandler?.([contradiction]);
    });

    await waitFor(() => {
      expect(screen.getByTestId('contradictions-count')).toHaveTextContent('1');
    });
  });
});
