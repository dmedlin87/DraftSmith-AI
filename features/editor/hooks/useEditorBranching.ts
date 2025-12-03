import { useCallback, useEffect, useState } from 'react';
import type { Branch, Chapter } from '@/types/schema';

interface UseEditorBranchingResult {
  branches: Branch[];
  activeBranchId: string | null;
  isOnMain: boolean;
  createBranch: (name: string) => void;
  switchBranch: (branchId: string | null) => void;
  mergeBranch: (branchId: string) => void;
  deleteBranch: (branchId: string) => void;
  renameBranch: (branchId: string, newName: string) => void;
}

export const useEditorBranching = (
  activeChapter: Chapter | undefined,
  currentText: string,
  updateText: (text: string) => void,
): UseEditorBranchingResult => {
  const [branches, setBranches] = useState<Branch[]>(activeChapter?.branches || []);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(
    activeChapter?.activeBranchId ?? null,
  );
  const [mainContent, setMainContent] = useState<string>(activeChapter?.content || '');

  useEffect(() => {
    if (activeChapter) {
      setBranches(activeChapter.branches || []);
      setActiveBranchId(activeChapter.activeBranchId ?? null);
      setMainContent(activeChapter.content || '');
    } else {
      // No active chapter: default branching state
      setBranches([]);
      setActiveBranchId(null);
      setMainContent('');
    }
  }, [activeChapter]);

  const createBranch = useCallback(
    (name: string) => {
      const newBranch: Branch = {
        id: crypto.randomUUID(),
        name,
        content: currentText,
        createdAt: Date.now(),
      };

      setBranches(prev => [...prev, newBranch]);
      // Persistence handled elsewhere (TODO in original context)
    },
    [currentText],
  );

  const switchBranch = useCallback(
    (branchId: string | null) => {
      if (branchId === null) {
        // Switch to main
        setActiveBranchId(null);
        updateText(mainContent);
        return;
      }

      const branch = branches.find(b => b.id === branchId);
      if (branch) {
        setActiveBranchId(branchId);
        updateText(branch.content);
      }
    },
    [branches, mainContent, updateText],
  );

  const mergeBranch = useCallback(
    (branchId: string) => {
      const branch = branches.find(b => b.id === branchId);
      if (branch) {
        setMainContent(branch.content);
        updateText(branch.content);
        setActiveBranchId(null);
      }
    },
    [branches, updateText],
  );

  const deleteBranch = useCallback(
    (branchId: string) => {
      if (activeBranchId === branchId) {
        setActiveBranchId(null);
        updateText(mainContent);
      }

      setBranches(prev => prev.filter(b => b.id !== branchId));
    },
    [activeBranchId, mainContent, updateText],
  );

  const renameBranch = useCallback((branchId: string, newName: string) => {
    setBranches(prev =>
      prev.map(b => (b.id === branchId ? { ...b, name: newName } : b)),
    );
  }, []);

  useEffect(() => {
    if (activeBranchId === null) {
      setMainContent(prev => (prev === currentText ? prev : currentText));
      return;
    }

    setBranches(prev =>
      prev.map(branch =>
        branch.id === activeBranchId && branch.content !== currentText
          ? { ...branch, content: currentText }
          : branch,
      ),
    );
  }, [activeBranchId, currentText]);

  const isOnMain = !activeBranchId;

  return {
    branches,
    activeBranchId,
    isOnMain,
    createBranch,
    switchBranch,
    mergeBranch,
    deleteBranch,
    renameBranch,
  };
};
