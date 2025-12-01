/**
 * Tests for EditorContext
 * Covers editor state, selection, branching, and comments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// Unmock EditorContext since this test needs the real implementation
vi.unmock('@/features/core/context/EditorContext');

import { EditorProvider, useEditor } from '@/features/core/context/EditorContext';

// Mock useProjectStore
const mockGetActiveChapter = vi.fn(() => ({
  id: 'chapter-1',
  content: 'Initial chapter content',
  branches: [],
  comments: [],
}));

vi.mock('@/features/project', () => ({
  useProjectStore: () => ({
    activeChapterId: 'chapter-1',
    updateChapterContent: vi.fn(),
    getActiveChapter: mockGetActiveChapter,
  }),
}));

// Mock useDocumentHistory
const mockUpdateText = vi.fn();
const mockCommit = vi.fn();
const mockUndo = vi.fn(() => true);
const mockRedo = vi.fn(() => true);
const mockRestore = vi.fn();
const mockReset = vi.fn();

vi.mock('@/features/editor/hooks/useDocumentHistory', () => ({
  useDocumentHistory: () => ({
    text: 'Current text content',
    updateText: mockUpdateText,
    commit: mockCommit,
    history: [{ id: '1', text: 'v1', timestamp: Date.now(), description: 'Initial', author: 'User' }],
    redoStack: [],
    undo: mockUndo,
    redo: mockRedo,
    canUndo: true,
    canRedo: false,
    restore: mockRestore,
    reset: mockReset,
    hasUnsavedChanges: false,
  }),
}));

// Wrapper component for hooks
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EditorProvider>{children}</EditorProvider>
);

describe('EditorContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveChapter.mockReturnValue({
      id: 'chapter-1',
      content: 'Initial chapter content',
      branches: [],
      comments: [],
    });
  });

  describe('useEditor hook', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        renderHook(() => useEditor());
      }).toThrow('useEditor must be used within an EditorProvider');
      
      consoleSpy.mockRestore();
    });

    it('provides editor context when used within provider', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current).toBeDefined();
      expect(result.current.currentText).toBe('Current text content');
    });
  });

  describe('Text & Content', () => {
    it('provides currentText from history hook', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.currentText).toBe('Current text content');
    });

    it('calls updateText when updating content', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.updateText('New content');
      });
      
      expect(mockUpdateText).toHaveBeenCalledWith('New content');
    });

    it('calls commit for tracked changes', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.commit('Changed text', 'Made an edit', 'User');
      });
      
      expect(mockCommit).toHaveBeenCalledWith('Changed text', 'Made an edit', 'User');
    });

    it('calls reset when loading new document', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.loadDocument('Brand new document');
      });
      
      expect(mockReset).toHaveBeenCalledWith('Brand new document');
    });
  });

  describe('History (Undo/Redo)', () => {
    it('provides history array', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].description).toBe('Initial');
    });

    it('provides canUndo/canRedo flags', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('calls undo function', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.undo();
      });
      
      expect(mockUndo).toHaveBeenCalled();
    });

    it('calls redo function', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.redo();
      });
      
      expect(mockRedo).toHaveBeenCalled();
    });

    it('calls restore with history item id', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.restore('history-item-123');
      });
      
      expect(mockRestore).toHaveBeenCalledWith('history-item-123');
    });
  });

  describe('Selection State', () => {
    it('starts with no selection', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.selectionRange).toBeNull();
      expect(result.current.selectionPos).toBeNull();
    });

    it('updates selection state', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.setSelectionState(
          { start: 10, end: 20, text: 'selected' },
          { top: 100, left: 50 }
        );
      });
      
      expect(result.current.selectionRange).toEqual({ start: 10, end: 20, text: 'selected' });
      expect(result.current.selectionPos).toEqual({ top: 100, left: 50 });
    });

    it('clears selection', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      // Set selection first
      act(() => {
        result.current.setSelectionState(
          { start: 10, end: 20, text: 'selected' },
          { top: 100, left: 50 }
        );
      });
      
      // Clear it
      act(() => {
        result.current.clearSelection();
      });
      
      expect(result.current.selectionRange).toBeNull();
      expect(result.current.selectionPos).toBeNull();
    });
  });

  describe('Editor Context for Agent', () => {
    it('provides getEditorContext function', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      const context = result.current.getEditorContext();
      
      expect(context).toHaveProperty('cursorPosition');
      expect(context).toHaveProperty('selection');
      expect(context).toHaveProperty('totalLength');
    });
  });

  describe('Branching', () => {
    it('starts with empty branches on main', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.branches).toEqual([]);
      expect(result.current.activeBranchId).toBeNull();
      expect(result.current.isOnMain).toBe(true);
    });

    it('creates a new branch', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.createBranch('My Branch');
      });
      
      expect(result.current.branches).toHaveLength(1);
      expect(result.current.branches[0].name).toBe('My Branch');
      expect(result.current.branches[0].content).toBe('Current text content');
    });

    it('switches to a branch', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      // Create a branch first
      act(() => {
        result.current.createBranch('Feature Branch');
      });
      
      const branchId = result.current.branches[0].id;
      
      // Switch to it
      act(() => {
        result.current.switchBranch(branchId);
      });
      
      expect(result.current.activeBranchId).toBe(branchId);
      expect(result.current.isOnMain).toBe(false);
    });

    it('switches back to main', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      // Create and switch to branch
      act(() => {
        result.current.createBranch('Feature Branch');
      });
      
      act(() => {
        result.current.switchBranch(result.current.branches[0].id);
      });
      
      // Switch back to main
      act(() => {
        result.current.switchBranch(null);
      });
      
      expect(result.current.activeBranchId).toBeNull();
      expect(result.current.isOnMain).toBe(true);
    });

    it('deletes a branch', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.createBranch('To Delete');
      });
      
      const branchId = result.current.branches[0].id;
      
      act(() => {
        result.current.deleteBranch(branchId);
      });
      
      expect(result.current.branches).toHaveLength(0);
    });

    it('renames a branch', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.createBranch('Original Name');
      });
      
      const branchId = result.current.branches[0].id;
      
      act(() => {
        result.current.renameBranch(branchId, 'New Name');
      });
      
      expect(result.current.branches[0].name).toBe('New Name');
    });

    it('returns to main when active branch is deleted', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.createBranch('Active Branch');
      });
      
      const branchId = result.current.branches[0].id;
      
      act(() => {
        result.current.switchBranch(branchId);
      });
      
      expect(result.current.isOnMain).toBe(false);
      
      act(() => {
        result.current.deleteBranch(branchId);
      });
      
      expect(result.current.isOnMain).toBe(true);
    });
  });

  describe('Inline Comments', () => {
    it('starts with empty comments', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.inlineComments).toEqual([]);
    });

    it('sets inline comments', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      const comments = [
        { id: '1', type: 'prose' as const, issue: 'Nice prose!', suggestion: '', severity: 'info' as const, quote: 'text', startIndex: 0, endIndex: 10, dismissed: false, createdAt: Date.now() },
        { id: '2', type: 'pacing' as const, issue: 'Consider revising', suggestion: 'Slow down', severity: 'warning' as const, quote: 'text2', startIndex: 20, endIndex: 30, dismissed: false, createdAt: Date.now() },
      ];
      
      act(() => {
        result.current.setInlineComments(comments);
      });
      
      expect(result.current.inlineComments).toHaveLength(2);
    });

    it('dismisses a comment', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.setInlineComments([
          { id: 'comment-1', type: 'plot' as const, issue: 'Test', suggestion: 'Fix it', severity: 'error' as const, quote: 'text', startIndex: 0, endIndex: 5, dismissed: false, createdAt: Date.now() },
        ]);
      });
      
      act(() => {
        result.current.dismissComment('comment-1');
      });
      
      expect(result.current.inlineComments[0].dismissed).toBe(true);
    });

    it('clears all comments', () => {
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      act(() => {
        result.current.setInlineComments([
          { id: '1', type: 'plot' as const, issue: 'Comment 1', suggestion: '', severity: 'warning' as const, quote: 'q1', startIndex: 0, endIndex: 5, dismissed: false, createdAt: Date.now() },
          { id: '2', type: 'character' as const, issue: 'Comment 2', suggestion: 'Fix', severity: 'info' as const, quote: 'q2', startIndex: 10, endIndex: 15, dismissed: false, createdAt: Date.now() },
        ]);
      });
      
      act(() => {
        result.current.clearComments();
      });
      
      expect(result.current.inlineComments).toHaveLength(0);
    });
  });

  describe('Initial state from chapter', () => {
    it('loads branches from active chapter', () => {
      mockGetActiveChapter.mockReturnValue({
        id: 'chapter-1',
        content: 'Content',
        branches: [
          { id: 'b1', name: 'Existing Branch', content: 'Branch content', createdAt: Date.now() },
        ],
        comments: [],
      });
      
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.branches).toHaveLength(1);
      expect(result.current.branches[0].name).toBe('Existing Branch');
    });

    it('loads comments from active chapter', () => {
      mockGetActiveChapter.mockReturnValue({
        id: 'chapter-1',
        content: 'Content',
        branches: [],
        comments: [
          { id: 'c1', type: 'plot' as const, issue: 'Existing issue', suggestion: 'Fix', severity: 'warning' as const, quote: 'quote', startIndex: 0, endIndex: 5, dismissed: false, createdAt: Date.now() },
        ],
      });
      
      const { result } = renderHook(() => useEditor(), { wrapper });
      
      expect(result.current.inlineComments).toHaveLength(1);
      expect(result.current.inlineComments[0].issue).toBe('Existing issue');
    });
  });
});
