import React, { forwardRef, useImperativeHandle } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMagicEditor } from '@/features/editor/hooks/useMagicEditor';

type SelectionRange = {
  start: number;
  end: number;
  text: string;
};

const rewriteTextMock = vi.fn();
const getContextualHelpMock = vi.fn();
const trackUsageMock = vi.fn();

vi.mock('@/services/gemini/agent', () => ({
  rewriteText: (...args: any[]) => rewriteTextMock(...args),
  getContextualHelp: (...args: any[]) => getContextualHelpMock(...args),
}));

vi.mock('@/features/shared', () => ({
  useUsage: () => ({ trackUsage: (...args: any[]) => trackUsageMock(...args) }),
}));

const MagicEditorHarness = forwardRef(
  (
    props: {
      selectionRange: SelectionRange | null;
      clearSelection: () => void;
      getCurrentText: () => string;
      commit: (text: string, desc: string, author: 'User' | 'Agent') => void;
      projectSetting?: { timePeriod: string; location: string };
    },
    ref: React.Ref<ReturnType<typeof useMagicEditor>>
  ) => {
    const hook = useMagicEditor(props);
    useImperativeHandle(ref, () => hook, [hook]);
    return null;
  }
);

describe('useMagicEditor', () => {
  const baseSelection: SelectionRange = { start: 0, end: 5, text: 'Draft' };
  let commitMock: ReturnType<typeof vi.fn>;
  let clearSelectionMock: ReturnType<typeof vi.fn>;
  let currentText = 'Draft text';

  beforeEach(() => {
    commitMock = vi.fn();
    clearSelectionMock = vi.fn();
    rewriteTextMock.mockReset();
    getContextualHelpMock.mockReset();
    trackUsageMock.mockReset();
    currentText = 'Draft text';
  });

  const renderHarness = (selectionRange: SelectionRange | null = baseSelection) => {
    const ref = React.createRef<ReturnType<typeof useMagicEditor>>();
    render(
      <MagicEditorHarness
        ref={ref}
        selectionRange={selectionRange}
        clearSelection={clearSelectionMock}
        getCurrentText={() => currentText}
        commit={commitMock}
      />
    );
    return ref;
  };

  it('captures rewrite flow and applies variations with validation', async () => {
    rewriteTextMock.mockResolvedValue({ result: ['Improved'], usage: { tokens: 1 } });
    const ref = renderHarness();

    await waitFor(() => expect(ref.current).toBeTruthy());
    await act(async () => {
      await ref.current?.actions.handleRewrite('Rewrite');
    });

    expect(rewriteTextMock).toHaveBeenCalledWith('Draft', 'Rewrite', undefined, undefined, expect.any(AbortSignal));
    expect(trackUsageMock).toHaveBeenCalled();

    await waitFor(() => expect(ref.current?.state.magicVariations).toEqual(['Improved']));

    await act(async () => {
      await ref.current?.actions.applyVariation('Improved Draft');
    });

    expect(commitMock).toHaveBeenCalledWith('Improved Draft text', 'Magic Edit: Variation Applied', 'User');
    expect(clearSelectionMock).toHaveBeenCalled();
    expect(ref.current?.state.magicError).toBeNull();
  });

  it('handles stale selections by clearing when text changes', async () => {
    rewriteTextMock.mockResolvedValue({ result: ['Improved'], usage: { tokens: 1 } });
    const ref = renderHarness();

    await waitFor(() => expect(ref.current).toBeTruthy());
    await act(async () => {
      await ref.current?.actions.handleRewrite('Rewrite');
    });

    currentText = 'Different text entirely';
    await act(async () => {
      await ref.current?.actions.applyVariation('Updated');
    });

    expect(commitMock).not.toHaveBeenCalled();
    expect(clearSelectionMock).toHaveBeenCalledTimes(1);
    expect(ref.current?.state.magicVariations).toEqual([]);
  });

  it('returns an error when applying without a captured selection', async () => {
    const ref = renderHarness(null);

    await waitFor(() => expect(ref.current).toBeTruthy());
    await act(async () => {
      await ref.current?.actions.applyVariation('Anything');
    });

    await waitFor(() => expect(ref.current?.state.magicError).toBe('No selection to apply to'));
    expect(commitMock).not.toHaveBeenCalled();
  });

  it('applies contextual replacements after help requests', async () => {
    getContextualHelpMock.mockResolvedValue({ result: 'Answer', usage: { tokens: 2 } });
    const ref = renderHarness();

    await waitFor(() => expect(ref.current).toBeTruthy());
    await act(async () => {
      await ref.current?.actions.handleHelp('Explain');
    });

    await act(async () => {
      await ref.current?.actions.applyVariation('Replacement');
    });

    expect(getContextualHelpMock).toHaveBeenCalled();
    expect(commitMock).toHaveBeenCalledWith('Replacement text', 'Magic Edit: Context Replacement', 'User');
  });
});
