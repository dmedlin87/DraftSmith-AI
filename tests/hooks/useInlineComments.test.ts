import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useInlineComments } from '@/features/editor/hooks/useInlineComments';
import { AnalysisResult } from '@/types';

vi.mock('@/features/shared', async () => {
  const actual = await vi.importActual<typeof import('@/features/shared/utils/textLocator')>(
    '@/features/shared/utils/textLocator'
  );
  return {
    findQuoteRange: actual.findQuoteRange,
  };
});

const baseAnalysis: AnalysisResult = {
  summary: '',
  strengths: [],
  weaknesses: [],
  pacing: {
    score: 0,
    analysis: '',
    slowSections: [{ description: 'Slow spot', quote: 'slow part' }],
    fastSections: [],
  },
  settingAnalysis: {
    score: 0,
    analysis: '',
    issues: [{ quote: 'setting detail', issue: 'Setting issue', suggestion: 'Add clarity' }],
  },
  plotIssues: [
    { issue: 'Plot hole', location: '1', suggestion: 'Fix plot', quote: 'plot quote' },
  ],
  characters: [
    {
      name: 'Alice',
      bio: '',
      arc: '',
      arcStages: [],
      relationships: [],
      plotThreads: [],
      inconsistencies: [{ issue: 'Out of character', quote: 'character line' }],
      developmentSuggestion: 'Grow',
    },
  ],
  generalSuggestions: [],
};

describe('useInlineComments', () => {
  const text = 'plot quote setting detail slow part character line';

  it('injects comments from analysis and groups by type', () => {
    const onCommentsChange = vi.fn();
    const { result } = renderHook(() => useInlineComments({ currentText: text, onCommentsChange }));

    act(() => result.current.injectFromAnalysis(baseAnalysis));

    expect(result.current.comments).toHaveLength(4);
    expect(result.current.visibleComments).toHaveLength(4);
    expect(result.current.commentsByType.plot).toHaveLength(1);
    expect(result.current.commentsByType.setting).toHaveLength(1);
    expect(result.current.commentsByType.character).toHaveLength(1);
    expect(result.current.commentsByType.pacing).toHaveLength(1);
    expect(onCommentsChange).toHaveBeenCalled();
  });

  it('supports manual add, dismiss, and clear operations', () => {
    const { result } = renderHook(() => useInlineComments({ currentText: text }));

    act(() => result.current.injectFromAnalysis(baseAnalysis));

    act(() => result.current.addComment({
      type: 'prose',
      issue: 'Prose tweak',
      suggestion: 'Tighten wording',
      severity: 'info',
      quote: 'plot',
      startIndex: 0,
      endIndex: 4,
    }));

    expect(result.current.comments).toHaveLength(5);
    expect(result.current.commentsByType.prose).toHaveLength(1);

    const firstId = result.current.comments[0].id;
    act(() => result.current.setActiveComment(result.current.comments[0]));
    act(() => result.current.dismissComment(firstId));

    expect(result.current.comments[0].dismissed).toBe(true);
    expect(result.current.visibleComments).toHaveLength(4);
    expect(result.current.activeComment).toBeNull();

    act(() => result.current.clearAllComments());

    expect(result.current.comments).toHaveLength(0);
    expect(result.current.visibleComments).toHaveLength(0);
  });
});
