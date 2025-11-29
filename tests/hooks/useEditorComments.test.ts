import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorComments } from '@/features/editor/hooks/useEditorComments';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import type { InlineComment } from '@/types/schema';

const makeComment = (overrides: Partial<InlineComment>): InlineComment => ({
  id: overrides.id ?? 'id-' + Math.random().toString(36).slice(2),
  type: overrides.type ?? 'plot',
  issue: overrides.issue ?? 'Issue',
  suggestion: overrides.suggestion ?? 'Suggestion',
  severity: overrides.severity ?? 'error',
  quote: overrides.quote ?? 'quote',
  startIndex: overrides.startIndex ?? 0,
  endIndex: overrides.endIndex ?? 10,
  dismissed: overrides.dismissed ?? false,
  createdAt: overrides.createdAt ?? Date.now(),
});

describe('useEditorComments', () => {
  beforeEach(() => {
    // Reset critiqueIntensity to a known default before each test
    useSettingsStore.setState({ critiqueIntensity: 'standard' });
  });

  it('filters visibleComments by critiqueIntensity', () => {
    const comments: InlineComment[] = [
      makeComment({ id: 'error', severity: 'error' }),
      makeComment({ id: 'warning', severity: 'warning' }),
      makeComment({ id: 'info', severity: 'info' }),
    ];

    const { result, rerender } = renderHook(() => useEditorComments(undefined));

    // Developmental: only errors
    act(() => {
      useSettingsStore.setState({ critiqueIntensity: 'developmental' });
      result.current.setInlineComments(comments);
    });

    expect(result.current.inlineComments).toHaveLength(3);
    expect(result.current.visibleComments.map((c) => c.severity)).toEqual(['error']);

    // Standard: errors + warnings
    act(() => {
      useSettingsStore.setState({ critiqueIntensity: 'standard' });
    });
    rerender();

    expect(result.current.visibleComments.map((c) => c.severity).sort()).toEqual(
      ['error', 'warning'].sort(),
    );

    // Intensive: all severities
    act(() => {
      useSettingsStore.setState({ critiqueIntensity: 'intensive' });
    });
    rerender();

    expect(result.current.visibleComments.map((c) => c.severity).sort()).toEqual(
      ['error', 'warning', 'info'].sort(),
    );
  });

  it('never includes dismissed comments in visibleComments', () => {
    const comments: InlineComment[] = [
      makeComment({ id: 'keep', severity: 'error', dismissed: false }),
      makeComment({ id: 'dismissed', severity: 'error', dismissed: true }),
    ];

    const { result } = renderHook(() => useEditorComments(undefined));

    act(() => {
      result.current.setInlineComments(comments);
    });

    expect(result.current.inlineComments).toHaveLength(2);
    expect(result.current.visibleComments.map((c) => c.id)).toEqual(['keep']);
  });
});
