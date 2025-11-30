import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useMagicEditor } from '@/features/editor/hooks/useMagicEditor';
import { rewriteText, getContextualHelp } from '@/services/gemini/agent';
import { ModelConfig } from '@/config/models';

const trackUsage = vi.fn();

vi.mock('@/services/gemini/agent', () => ({
  rewriteText: vi.fn(),
  getContextualHelp: vi.fn(),
}));

vi.mock('@/features/shared', () => ({
  useUsage: () => ({ trackUsage }),
}));

describe('useMagicEditor', () => {
  const baseSelection = { start: 0, end: 4, text: 'Test' };
  const clearSelection = vi.fn();
  const commit = vi.fn();
  let currentText = 'Test content';
  const getCurrentText = () => currentText;

  beforeEach(() => {
    vi.clearAllMocks();
    currentText = 'Test content';
  });

  it('handles rewrite flow and stores variations', async () => {
    vi.mocked(rewriteText).mockResolvedValue({
      result: ['Variation A', 'Variation B'],
      usage: { promptTokenCount: 5, totalTokenCount: 10 },
    });

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
      projectSetting: { timePeriod: 'Now', location: 'Here' },
    }));

    await act(async () => {
      await result.current.actions.handleRewrite('Rewrite');
    });

    await waitFor(() => {
      expect(result.current.state.magicVariations).toEqual(['Variation A', 'Variation B']);
      expect(result.current.state.activeMagicMode).toBe('Rewrite');
      expect(result.current.state.isMagicLoading).toBe(false);
    });

    expect(trackUsage).toHaveBeenCalledWith({ promptTokenCount: 5, totalTokenCount: 10 }, ModelConfig.agent);
  });

  it('applies variation to selection and commits update', async () => {
    vi.mocked(rewriteText).mockResolvedValue({
      result: ['Variation'],
      usage: { promptTokenCount: 1, totalTokenCount: 1 },
    });

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleRewrite('Rewrite');
    });

    await waitFor(() => expect(result.current.state.magicVariations).toHaveLength(1));

    act(() => {
      result.current.actions.applyVariation('Better');
    });

    expect(commit).toHaveBeenCalledWith('Better content', 'Magic Edit: Variation Applied', 'User');
    expect(clearSelection).toHaveBeenCalled();
    expect(result.current.state.magicVariations).toEqual([]);
  });

  it('prevents applying variation when selection is stale', async () => {
    vi.mocked(rewriteText).mockResolvedValue({
      result: ['Variation'],
      usage: { promptTokenCount: 1, totalTokenCount: 1 },
    });

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleRewrite('Rewrite');
    });

    currentText = 'Changed text since selection';

    act(() => {
      result.current.actions.applyVariation('Better');
    });

    expect(commit).not.toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
    expect(result.current.state.activeMagicMode).toBeNull();
  });

  it('handles contextual help requests', async () => {
    vi.mocked(getContextualHelp).mockResolvedValue({
      result: 'Definition',
      usage: { promptTokenCount: 3, totalTokenCount: 5 },
    });

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleHelp('Explain');
    });

    await waitFor(() => {
      expect(result.current.state.magicHelpResult).toBe('Definition');
      expect(result.current.state.magicHelpType).toBe('Explain');
      expect(result.current.state.isMagicLoading).toBe(false);
    });

    expect(trackUsage).toHaveBeenCalledWith({ promptTokenCount: 3, totalTokenCount: 5 }, ModelConfig.agent);
  });

  it('does not trigger help for empty or whitespace-only selection', async () => {
    const { result } = renderHook(() => useMagicEditor({
      selectionRange: { ...baseSelection, text: '   ' },
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleHelp('Explain');
    });

    expect(getContextualHelp).not.toHaveBeenCalled();
    expect(result.current.state.isMagicLoading).toBe(false);
  });

  it('handles help request failure gracefully', async () => {
    vi.mocked(getContextualHelp).mockRejectedValue(new Error('Help API Error'));

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleHelp('Explain');
    });

    await waitFor(() => {
      expect(result.current.state.magicError).toBe('Help API Error');
      expect(result.current.state.isMagicLoading).toBe(false);
      expect(result.current.state.magicHelpResult).toBeNull();
    });
  });

  it('handles Tone Tuner mode formatting', async () => {
    vi.mocked(rewriteText).mockResolvedValue({
      result: ['Tone Variation'],
      usage: { promptTokenCount: 1, totalTokenCount: 1 },
    });

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleRewrite('Tone Tuner', 'Sarcastic');
    });

    await waitFor(() => {
      expect(result.current.state.activeMagicMode).toBe('Tone: Sarcastic');
    });
  });

  it('does not trigger rewrite for empty or whitespace-only selection', async () => {
    const { result } = renderHook(() => useMagicEditor({
      selectionRange: { ...baseSelection, text: '   ' },
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleRewrite('Rewrite');
    });

    expect(rewriteText).not.toHaveBeenCalled();
    expect(result.current.state.isMagicLoading).toBe(false);
  });

  it('handles rewrite failure gracefully', async () => {
    vi.mocked(rewriteText).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      await result.current.actions.handleRewrite('Rewrite');
    });

    await waitFor(() => {
      expect(result.current.state.magicError).toBe('API Error');
      expect(result.current.state.isMagicLoading).toBe(false);
      expect(result.current.state.magicVariations).toEqual([]);
    });
  });

  it('aborts pending rewrite operation when starting new one', async () => {
    // Mock a slow response
    vi.mocked(rewriteText).mockImplementation(async (text, mode, tone, settings, signal) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (signal?.aborted) return { result: [], usage: { promptTokenCount: 0, totalTokenCount: 0 } };
      return { result: ['Variation'], usage: { promptTokenCount: 1, totalTokenCount: 1 } };
    });

    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    await act(async () => {
      result.current.actions.handleRewrite('First');
    });
    
    // Immediately trigger second rewrite
    await act(async () => {
      result.current.actions.handleRewrite('Second');
    });

    await waitFor(() => {
      expect(result.current.state.activeMagicMode).toBe('Second');
    });

    // Only the second call should complete successfully
    expect(rewriteText).toHaveBeenCalledTimes(2);
  });

  it('commits context replacement when no variations exist', async () => {
    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    // Manually populate the captured selection via handleRewrite but assume empty result?
    // Or just mock handleRewrite to return empty variations.
    vi.mocked(rewriteText).mockResolvedValue({ result: [], usage: { promptTokenCount: 0, totalTokenCount: 0 } });

    await act(async () => {
      await result.current.actions.handleRewrite('Fix Grammar');
    });

    act(() => {
      result.current.actions.applyVariation('Fixed content');
    });

    expect(commit).toHaveBeenCalledWith(
      'Fixed content content', // "Test" replaced by "Fixed content" in "Test content" -> "Fixed content content"
      'Magic Edit: Context Replacement',
      'User'
    );
  });

  it('prevents applyVariation with no captured selection', () => {
    const { result } = renderHook(() => useMagicEditor({
      selectionRange: baseSelection,
      clearSelection,
      getCurrentText,
      commit,
    }));

    act(() => {
      // Called without handleRewrite first
      result.current.actions.applyVariation('New Text');
    });

    expect(result.current.state.magicError).toBe('No selection to apply to');
    expect(commit).not.toHaveBeenCalled();
  });
});
