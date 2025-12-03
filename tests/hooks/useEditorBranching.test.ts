import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { useEditorBranching } from '@/features/editor';
import type { Chapter } from '@/types/schema';

const baseChapter: Chapter = {
  id: 'chapter-1',
  projectId: 'project-1',
  title: 'Test Chapter',
  content: 'Main text',
  order: 1,
  updatedAt: 0,
  branches: [
    {
      id: 'branch-1',
      name: 'Idea 1',
      content: 'Branch text',
      createdAt: 0,
    },
  ],
  activeBranchId: null,
};

describe('useEditorBranching', () => {
  it('keeps main edits when switching away and back', () => {
    const updateText = vi.fn();
    const { result, rerender } = renderHook(
      ({ activeChapter, currentText }: { activeChapter: Chapter; currentText: string }) =>
        useEditorBranching(activeChapter, currentText, updateText),
      {
        initialProps: { activeChapter: baseChapter, currentText: baseChapter.content },
      },
    );

    rerender({ activeChapter: baseChapter, currentText: 'Edited main text' });

    act(() => result.current.switchBranch('branch-1'));
    expect(updateText).toHaveBeenCalledWith('Branch text');

    updateText.mockClear();
    act(() => result.current.switchBranch(null));
    expect(updateText).toHaveBeenCalledWith('Edited main text');
  });

  it('persists branch edits while active', () => {
    const updateText = vi.fn();
    const { result, rerender } = renderHook(
      ({ activeChapter, currentText }: { activeChapter: Chapter; currentText: string }) =>
        useEditorBranching(activeChapter, currentText, updateText),
      {
        initialProps: { activeChapter: baseChapter, currentText: baseChapter.content },
      },
    );

    act(() => result.current.switchBranch('branch-1'));
    updateText.mockClear();

    rerender({ activeChapter: baseChapter, currentText: 'Rewritten branch text' });

    act(() => result.current.switchBranch(null));
    expect(result.current.branches.find(branch => branch.id === 'branch-1')?.content).toBe(
      'Rewritten branch text',
    );
    expect(updateText).toHaveBeenCalledWith('Main text');

    updateText.mockClear();
    act(() => result.current.switchBranch('branch-1'));
    expect(updateText).toHaveBeenCalledWith('Rewritten branch text');
  });
});
