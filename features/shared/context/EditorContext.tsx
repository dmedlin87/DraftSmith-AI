import React, { createContext, useContext, useCallback, useState } from 'react';
import { useProjectStore } from '@/features/project';
import { useDocumentHistory } from '@/features/editor/hooks/useDocumentHistory';
import { useEditorSelection } from '@/features/editor/hooks/useEditorSelection';
import { useEditorComments } from '@/features/editor/hooks/useEditorComments';
import { useEditorBranching } from '@/features/editor/hooks/useEditorBranching';

import { HistoryItem, HighlightRange, EditorContext as EditorContextType } from '@/types';

import { Editor } from '@tiptap/react';
import { Branch, InlineComment } from '@/types/schema';

/**
 * EditorContext - The Unified Editor Core
 * 
 * Single source of truth for:
 * - Tiptap editor instance
 * - Text content and mutations
 * - Selection and cursor state
 * - Undo/Redo history stack
 * - Document navigation (highlight jumps)
 * - Branching (multiverse)
 * - Inline comments (critique system)
 */
export interface EditorContextValue {
  // Editor Instance
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;

  // Text & Content
  currentText: string;
  updateText: (text: string) => void;
  commit: (text: string, description: string, author: 'User' | 'Agent') => void;
  loadDocument: (text: string) => void;

  // History (Undo/Redo)
  history: HistoryItem[];
  redoStack: HistoryItem[];
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  restore: (id: string) => void;
  hasUnsavedChanges: boolean;

  // Selection & Cursor
  selectionRange: { start: number; end: number; text: string } | null;
  selectionPos: { top: number; left: number } | null;
  cursorPosition: number;
  setSelection: (start: number, end: number) => void;
  setSelectionState: (range: { start: number; end: number; text: string } | null, pos: { top: number; left: number } | null) => void;
  clearSelection: () => void;

  // Navigation & Highlighting
  activeHighlight: HighlightRange | null;
  handleNavigateToIssue: (start: number, end: number) => void;
  scrollToPosition: (position: number) => void;

  // Computed Context (for agent)
  getEditorContext: () => EditorContextType;

  // Quill AI 3.0: Branching
  branches: Branch[];
  activeBranchId: string | null;
  isOnMain: boolean;
  createBranch: (name: string) => void;
  switchBranch: (branchId: string | null) => void;
  mergeBranch: (branchId: string) => void;
  deleteBranch: (branchId: string) => void;
  renameBranch: (branchId: string, newName: string) => void;

  // Quill AI 3.0: Inline Comments
  inlineComments: InlineComment[];
  visibleComments: InlineComment[];
  setInlineComments: (comments: InlineComment[]) => void;
  dismissComment: (commentId: string) => void;
  clearComments: () => void;

  // Quill AI 3.0: Zen Mode
  isZenMode: boolean;
  toggleZenMode: () => void;
}

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { 
    activeChapterId, 
    updateChapterContent,
    getActiveChapter 
  } = useProjectStore();
  
  const activeChapter = getActiveChapter();

  // Tiptap Editor Instance
  const [editor, setEditor] = useState<Editor | null>(null);

  // Persistence Callback
  const handleSaveContent = useCallback((text: string) => {
    if (activeChapterId) updateChapterContent(activeChapterId, text);
  }, [activeChapterId, updateChapterContent]);

  // Full History & Text Hook with undo/redo
  const { 
    text: currentText, 
    updateText, 
    commit, 
    history, 
    redoStack,
    undo,
    redo,
    canUndo,
    canRedo,
    restore, 
    reset: loadDocument,
    hasUnsavedChanges 
  } = useDocumentHistory(
    activeChapter?.content || '', 
    activeChapterId, 
    handleSaveContent
  );

  // Selection State & Navigation
  const {
    selectionRange,
    selectionPos,
    cursorPosition,
    setSelection,
    setSelectionState,
    clearSelection,
    activeHighlight,
    handleNavigateToIssue,
    scrollToPosition,
    getEditorContext,
  } = useEditorSelection({ editor, currentText });

  // Quill AI 3.0: Branching State
  const {
    branches,
    activeBranchId,
    isOnMain,
    createBranch,
    switchBranch,
    mergeBranch,
    deleteBranch,
    renameBranch,
  } = useEditorBranching(activeChapter, currentText, updateText);

  // Quill AI 3.0: Inline Comments State
  const {
    inlineComments,
    visibleComments,
    setInlineComments,
    dismissComment,
    clearComments,
  } = useEditorComments(activeChapter);

  // Quill AI 3.0: Zen Mode State
  const [isZenMode, setIsZenMode] = useState(false);
  const toggleZenMode = useCallback(() => setIsZenMode(prev => !prev), []);

  const value: EditorContextValue = {
    // Editor Instance
    editor,
    setEditor,
    // Text & Content
    currentText,
    updateText,
    commit,
    loadDocument,
    // History (Undo/Redo)
    history,
    redoStack,
    undo,
    redo,
    canUndo,
    canRedo,
    restore,
    hasUnsavedChanges,
    // Selection & Cursor
    selectionRange,
    selectionPos,
    cursorPosition,
    setSelection,
    setSelectionState,
    clearSelection,
    // Navigation & Highlighting
    activeHighlight,
    handleNavigateToIssue,
    scrollToPosition,
    // Computed Context
    getEditorContext,
    // Branching
    branches,
    activeBranchId,
    isOnMain,
    createBranch,
    switchBranch,
    mergeBranch,
    deleteBranch,
    renameBranch,
    // Inline Comments
    inlineComments,
    visibleComments,
    setInlineComments,
    dismissComment,
    clearComments,
    // Zen Mode
    isZenMode,
    toggleZenMode,
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};

// Backward compatibility alias
export const useManuscript = useEditor;
export type ManuscriptContextValue = EditorContextValue;
export const ManuscriptProvider = EditorProvider;