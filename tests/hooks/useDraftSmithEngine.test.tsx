import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ModelConfig } from '@/config/models';

const analyzeDraftMock = vi.fn();
const trackUsageMock = vi.fn();
const updateChapterAnalysisMock = vi.fn();
const updateProjectLoreMock = vi.fn();
const commitMock = vi.fn();

vi.mock('@/services/gemini/analysis', () => ({
  analyzeDraft: (...args: unknown[]) => analyzeDraftMock(...args)
}));

vi.mock('@/features/shared/context/UsageContext', () => ({
  useUsage: () => ({ trackUsage: trackUsageMock })
}));

const magicActionsMock = {
  handleRewrite: vi.fn(),
};

vi.mock('@/features/editor/hooks/useMagicEditor', () => ({
  useMagicEditor: () => ({
    state: {
      magicVariations: [],
      activeMagicMode: null,
      magicHelpResult: null,
      magicHelpType: null,
      isMagicLoading: false,
      magicError: null,
    },
    actions: magicActionsMock,
  })
}));

import { useQuillAIEngine } from '@/features/shared';

const baseResult = {
  result: {
    settingAnalysis: { issues: [] },
    characters: [],
  },
  usage: { promptTokenCount: 1, totalTokenCount: 2 }
};

const project = {
  id: 'project-1',
  setting: { timePeriod: 'now', location: 'earth' },
  manuscriptIndex: undefined,
};

describe('useQuillAIEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeDraftMock.mockResolvedValue(baseResult);
    updateChapterAnalysisMock.mockResolvedValue(undefined);
    updateProjectLoreMock.mockResolvedValue(undefined);
  });

  const getCurrentText = () => 'chapter text';

  const buildHook = (selectionRange: any = null) => renderHook(() => useQuillAIEngine({
    getCurrentText,
    currentProject: project,
    activeChapterId: 'chapter-1',
    updateChapterAnalysis: updateChapterAnalysisMock,
    updateProjectLore: updateProjectLoreMock,
    commit: commitMock,
    selectionRange,
    clearSelection: vi.fn(),
  }));

  it('runs analysis and updates project data', async () => {
    const { result } = buildHook();

    await act(async () => {
      await result.current.actions.runAnalysis();
    });

    expect(analyzeDraftMock).toHaveBeenCalledWith(
      'chapter text',
      project.setting,
      project.manuscriptIndex,
      expect.any(AbortSignal)
    );
    expect(trackUsageMock).toHaveBeenCalledWith(baseResult.usage, ModelConfig.analysis);
    expect(updateChapterAnalysisMock).toHaveBeenCalledWith('chapter-1', { ...baseResult.result, warning: null });
    expect(updateProjectLoreMock).toHaveBeenCalledWith('project-1', {
      characters: [],
      worldRules: []
    });
    expect(result.current.state.isAnalyzing).toBe(false);
    expect(result.current.state.analysisError).toBeNull();
  });

  it('creates and accepts pending diffs from agent actions', async () => {
    const { result } = buildHook();

    await act(async () => {
      const message = await result.current.actions.handleAgentAction('update_manuscript', {
        search_text: 'chapter',
        replacement_text: 'story',
        description: 'desc'
      });
      expect(message).toContain('Waiting for user review');
    });

    expect(result.current.state.pendingDiff).toMatchObject({
      original: 'chapter text',
      modified: 'story text',
      description: 'desc',
      author: 'Agent'
    });

    await act(async () => {
      result.current.actions.acceptDiff();
    });

    expect(commitMock).toHaveBeenCalledWith('story text', 'desc', 'Agent');
    expect(result.current.state.pendingDiff).toBeNull();
  });

  it('rejects pending diffs without committing', async () => {
    const { result } = buildHook();

    await act(async () => {
      await result.current.actions.handleAgentAction('update_manuscript', {
        search_text: 'chapter',
        replacement_text: 'story',
        description: 'desc'
      });
    });

    await act(() => {
      result.current.actions.rejectDiff();
    });

    expect(commitMock).not.toHaveBeenCalled();
    expect(result.current.state.pendingDiff).toBeNull();
  });

  it('handles rapid analysis calls by aborting previous requests', async () => {
    let resolveFirst: (value: typeof baseResult) => void;
    let resolveSecond: (value: typeof baseResult) => void;
    const firstCallPromise = new Promise<typeof baseResult>((resolve) => { resolveFirst = resolve; });
    const secondCallPromise = new Promise<typeof baseResult>((resolve) => { resolveSecond = resolve; });
    
    let callCount = 0;
    analyzeDraftMock.mockImplementation((_text: string, _setting: unknown, _index: unknown, signal: AbortSignal) => {
      callCount++;
      if (callCount === 1) {
        return firstCallPromise.then(result => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          return result;
        });
      }
      return secondCallPromise.then(result => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return result;
      });
    });

    const { result } = buildHook();

    // Start first analysis
    let firstAnalysisPromise: Promise<void>;
    act(() => {
      firstAnalysisPromise = result.current.actions.runAnalysis();
    });

    expect(result.current.state.isAnalyzing).toBe(true);

    // Start second analysis before first completes (should abort first)
    let secondAnalysisPromise: Promise<void>;
    act(() => {
      secondAnalysisPromise = result.current.actions.runAnalysis();
    });

    // Complete second analysis first
    await act(async () => {
      resolveSecond!(baseResult);
      await secondAnalysisPromise!;
    });

    // Complete first analysis (should be ignored due to abort)
    await act(async () => {
      resolveFirst!(baseResult);
      try { await firstAnalysisPromise!; } catch { /* expected abort */ }
    });

    // Only second call should have updated chapter analysis
    expect(updateChapterAnalysisMock).toHaveBeenCalledTimes(1);
    expect(result.current.state.isAnalyzing).toBe(false);
  });

  it('returns error message when update_manuscript fails to find text', async () => {
    const { result } = renderHook(() => useQuillAIEngine({
      getCurrentText: () => 'completely different text',
      currentProject: project,
      activeChapterId: 'chapter-1',
      updateChapterAnalysis: updateChapterAnalysisMock,
      updateProjectLore: updateProjectLoreMock,
      commit: commitMock,
      selectionRange: null,
      clearSelection: vi.fn(),
    }));

    await expect(
      act(async () => {
        await result.current.actions.handleAgentAction('update_manuscript', {
          search_text: 'nonexistent phrase',
          replacement_text: 'replacement',
          description: 'test'
        });
      })
    ).rejects.toThrow('Could not find the exact text to replace');

    expect(result.current.state.pendingDiff).toBeNull();
  });

  it('handles unknown agent actions gracefully', async () => {
    const { result } = buildHook();

    let response: string;
    await act(async () => {
      response = await result.current.actions.handleAgentAction(
        'invalid_action' as never,
        undefined
      );
    });

    expect(response!).toBe('Unknown action.');
    expect(result.current.state.pendingDiff).toBeNull();
  });

  it('skips analysis when text is empty', async () => {
    const { result } = renderHook(() => useQuillAIEngine({
      getCurrentText: () => '   ',
      currentProject: project,
      activeChapterId: 'chapter-1',
      updateChapterAnalysis: updateChapterAnalysisMock,
      updateProjectLore: updateProjectLoreMock,
      commit: commitMock,
      selectionRange: null,
      clearSelection: vi.fn(),
    }));

    await act(async () => {
      await result.current.actions.runAnalysis();
    });

    expect(analyzeDraftMock).not.toHaveBeenCalled();
    expect(result.current.state.isAnalyzing).toBe(false);
  });

  it('persists warnings from truncated input', async () => {
    analyzeDraftMock.mockResolvedValue({
      ...baseResult,
      warning: { message: 'Truncated input', removedChars: 10, removedPercent: 5, originalLength: 200 },
    });

    const { result } = buildHook();

    await act(async () => {
      await result.current.actions.runAnalysis();
    });

    expect(updateChapterAnalysisMock).toHaveBeenCalledWith(
      'chapter-1',
      expect.objectContaining({ warning: expect.objectContaining({ message: 'Truncated input' }) })
    );
    expect(result.current.state.analysisWarning?.message).toContain('Truncated input');
  });

  it('offers selection-only analysis when provided a selection', async () => {
    analyzeDraftMock.mockResolvedValue(baseResult);
    const selectionRange = { start: 0, end: 5, text: 'slice' };
    const { result } = buildHook(selectionRange);

    await act(async () => {
      await result.current.actions.runSelectionAnalysis();
    });

    expect(analyzeDraftMock).toHaveBeenCalledWith(
      'slice',
      project.setting,
      project.manuscriptIndex,
      expect.any(AbortSignal)
    );
    expect(updateChapterAnalysisMock).toHaveBeenCalledWith(
      'chapter-1',
      expect.objectContaining({ warning: expect.objectContaining({ message: expect.stringContaining('selected text') }) })
    );
  });
});
