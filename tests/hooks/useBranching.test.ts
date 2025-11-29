import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useBranching } from '@/features/editor/hooks/useBranching';

const createBranchWithHook = () => {
  const onBranchesChange = vi.fn();
  const onContentChange = vi.fn();
  const hook = renderHook(() => useBranching({
    mainContent: 'Main content',
    onBranchesChange,
    onContentChange,
  }));

  return { hook, onBranchesChange, onContentChange };
};

describe('useBranching', () => {
  it('creates branches and switches between main and branch content', () => {
    const { hook, onBranchesChange, onContentChange } = createBranchWithHook();

    let branchId = '';
    act(() => {
      branchId = hook.result.current.createBranch('Idea 1', 'Branch text');
    });

    expect(hook.result.current.branches).toHaveLength(1);
    expect(onBranchesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: branchId, name: 'Idea 1', content: 'Branch text' }),
      ])
    );

    act(() => hook.result.current.switchBranch(branchId));

    expect(hook.result.current.activeBranchId).toBe(branchId);
    expect(hook.result.current.currentContent).toBe('Branch text');
    expect(hook.result.current.isOnMain).toBe(false);
    expect(onContentChange).toHaveBeenCalledWith('Branch text');

    act(() => hook.result.current.switchBranch(null));

    expect(hook.result.current.activeBranchId).toBeNull();
    expect(hook.result.current.currentContent).toBe('Main content');
    expect(hook.result.current.isOnMain).toBe(true);
  });

  it('updates branch content and merges back to main', () => {
    const { hook, onContentChange } = createBranchWithHook();

    let branchId = '';
    act(() => {
      branchId = hook.result.current.createBranch('Idea 1', 'Initial branch');
    });

    act(() => hook.result.current.switchBranch(branchId));

    act(() => hook.result.current.updateBranchContent('Revised branch content'));

    expect(hook.result.current.branches[0].content).toBe('Revised branch content');
    expect(onContentChange).toHaveBeenCalledWith('Revised branch content');

    act(() => hook.result.current.mergeBranch(branchId));

    expect(hook.result.current.activeBranchId).toBeNull();
    expect(hook.result.current.currentContent).toBe('Revised branch content');
    expect(onContentChange).toHaveBeenLastCalledWith('Revised branch content');
  });

  it('renames and deletes branches, honoring callbacks', () => {
    const { hook, onBranchesChange, onContentChange } = createBranchWithHook();

    let branchId = '';
    act(() => {
      branchId = hook.result.current.createBranch('Idea 1');
      hook.result.current.switchBranch(branchId);
    });

    act(() => hook.result.current.renameBranch(branchId, 'Renamed'));
    expect(hook.result.current.branches[0].name).toBe('Renamed');

    act(() => hook.result.current.deleteBranch(branchId));

    expect(hook.result.current.branches).toHaveLength(0);
    expect(onBranchesChange).toHaveBeenCalledWith([]);
    expect(hook.result.current.activeBranchId).toBeNull();
    expect(hook.result.current.isOnMain).toBe(true);
  });

  it('updates main content when no branch is active', () => {
    const { hook, onContentChange } = createBranchWithHook();

    act(() => hook.result.current.updateBranchContent('Edited main content'));

    expect(hook.result.current.currentContent).toBe('Edited main content');
    expect(onContentChange).toHaveBeenCalledWith('Edited main content');
  });
});
