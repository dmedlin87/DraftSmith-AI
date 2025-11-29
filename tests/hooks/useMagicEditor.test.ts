import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useMagicEditor } from '@/features/editor/hooks/useMagicEditor';
import { rewriteText, getContextualHelp } from '@/services/gemini/agent';

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
      usage: { tokens: 10 },
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

    expect(trackUsage).toHaveBeenCalledWith({ tokens: 10 });
  });

  it('applies variation to selection and commits update', async () => {
    vi.mocked(rewriteText).mockResolvedValue({
      result: ['Variation'],
      usage: { tokens: 1 },
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
      usage: { tokens: 1 },
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
      usage: { tokens: 5 },
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

    expect(trackUsage).toHaveBeenCalledWith({ tokens: 5 });
  });
});
