import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';

import { useProjectStore } from '@/features/project';
import { useDocumentHistory, useEditorSelection, useEditorComments, useEditorBranching } from '@/features/editor';

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

type EditorStateContextValue = Pick<EditorContextValue,
  | 'editor'
  | 'currentText'
  | 'history'
  | 'redoStack'
  | 'canUndo'
  | 'canRedo'
  | 'hasUnsavedChanges'
  | 'selectionRange'
  | 'selectionPos'
  | 'cursorPosition'
  | 'activeHighlight'
  | 'branches'
  | 'activeBranchId'
  | 'isOnMain'
  | 'inlineComments'
  | 'visibleComments'
  | 'isZenMode'
>;

type EditorActionsContextValue = Pick<EditorContextValue,
  | 'setEditor'
  | 'updateText'
  | 'commit'
  | 'loadDocument'
  | 'undo'
  | 'redo'
  | 'restore'
  | 'setSelection'
  | 'setSelectionState'
  | 'clearSelection'
  | 'handleNavigateToIssue'
  | 'scrollToPosition'
  | 'getEditorContext'
  | 'createBranch'
  | 'switchBranch'
  | 'mergeBranch'
  | 'deleteBranch'
  | 'renameBranch'
  | 'setInlineComments'
  | 'dismissComment'
  | 'clearComments'
  | 'toggleZenMode'
>;

const EditorContext = createContext<EditorContextValue | undefined>(undefined);
const EditorStateContext = createContext<EditorStateContextValue | undefined>(undefined);
const EditorActionsContext = createContext<EditorActionsContextValue | undefined>(undefined);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { 
    activeChapterId, 
    updateChapterContent,
    getActiveChapter 
  } = useProjectStore((state) => ({
    activeChapterId: state.activeChapterId,
    updateChapterContent: state.updateChapterContent,
    getActiveChapter: state.getActiveChapter,
  }));
  
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

  const stateValue: EditorStateContextValue = useMemo(() => ({
    editor,
    currentText,
    history,
    redoStack,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    selectionRange,
    selectionPos,
    cursorPosition,
    activeHighlight,
    branches,
    activeBranchId,
    isOnMain,
    inlineComments,
    visibleComments,
    isZenMode,
  }), [
    editor,
    currentText,
    history,
    redoStack,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    selectionRange,
    selectionPos,
    cursorPosition,
    activeHighlight,
    branches,
    activeBranchId,
    isOnMain,
    inlineComments,
    visibleComments,
    isZenMode,
  ]);

  const setEditorStable = useCallback((next: Editor | null) => setEditor(next), []);
  const updateTextStable = useCallback((text: string) => updateText(text), [updateText]);
  const commitStable = useCallback((text: string, description: string, author: 'User' | 'Agent') => commit(text, description, author), [commit]);
  const loadDocumentStable = useCallback((text: string) => loadDocument(text), [loadDocument]);
  const undoStable = useCallback(() => undo(), [undo]);
  const redoStable = useCallback(() => redo(), [redo]);
  const restoreStable = useCallback((id: string) => restore(id), [restore]);

  const actionsValue: EditorActionsContextValue = useMemo(() => ({
    setEditor: setEditorStable,
    updateText: updateTextStable,
    commit: commitStable,
    loadDocument: loadDocumentStable,
    undo: undoStable,
    redo: redoStable,
    restore: restoreStable,
    setSelection,
    setSelectionState,
    clearSelection,
    handleNavigateToIssue,
    scrollToPosition,
    getEditorContext,
    createBranch,
    switchBranch,
    mergeBranch,
    deleteBranch,
    renameBranch,
    setInlineComments,
    dismissComment,
    clearComments,
    toggleZenMode,
  }), [
    setEditorStable,
    updateTextStable,
    commitStable,
    loadDocumentStable,
    undoStable,
    redoStable,
    restoreStable,
    setSelection,
    setSelectionState,
    clearSelection,
    handleNavigateToIssue,
    scrollToPosition,
    getEditorContext,
    createBranch,
    switchBranch,
    mergeBranch,
    deleteBranch,
    renameBranch,
    setInlineComments,
    dismissComment,
    clearComments,
    toggleZenMode,
  ]);

  const value: EditorContextValue = useMemo(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <EditorStateContext.Provider value={stateValue}>
      <EditorActionsContext.Provider value={actionsValue}>
        <EditorContext.Provider value={value}>
          {children}
        </EditorContext.Provider>
      </EditorActionsContext.Provider>
    </EditorStateContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};

export const useEditorState = () => {
  const context = useContext(EditorStateContext);
  if (!context) {
    throw new Error('useEditorState must be used within an EditorProvider');
  }
  return context;
};

export const useEditorActions = () => {
  const context = useContext(EditorActionsContext);
  if (!context) {
    throw new Error('useEditorActions must be used within an EditorProvider');
  }
  return context;
};

// Backward compatibility alias
export const useManuscript = useEditor;
export type ManuscriptContextValue = EditorContextValue;
export const ManuscriptProvider = EditorProvider;