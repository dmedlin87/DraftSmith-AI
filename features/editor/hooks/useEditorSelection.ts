import { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import type { HighlightRange, EditorContext as AgentEditorContext } from '@/types';

interface UseEditorSelectionArgs {
  editor: Editor | null;
  currentText: string;
}

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

interface UseEditorSelectionResult {
  selectionRange: SelectionRange | null;
  selectionPos: { top: number; left: number } | null;
  cursorPosition: number;
  setSelection: (start: number, end: number) => void;
  setSelectionState: (
    range: SelectionRange | null,
    pos: { top: number; left: number } | null
  ) => void;
  clearSelection: () => void;
  activeHighlight: HighlightRange | null;
  handleNavigateToIssue: (start: number, end: number) => void;
  scrollToPosition: (position: number) => void;
  getEditorContext: () => AgentEditorContext;
}

export const useEditorSelection = ({
  editor,
  currentText,
}: UseEditorSelectionArgs): UseEditorSelectionResult => {
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<HighlightRange | null>(null);

  const cursorPosition = editor?.state.selection.from || 0;

  const setSelectionState = useCallback(
    (
      range: SelectionRange | null,
      pos: { top: number; left: number } | null
    ) => {
      setSelectionRange(range);
      setSelectionPos(pos);
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectionRange(null);
    setSelectionPos(null);
    editor?.commands.focus();
  }, [editor]);

  const setSelection = useCallback(
    (start: number, end: number) => {
      if (!editor) return;

      const safeStart = Math.max(0, Math.min(start, editor.state.doc.content.size));
      const safeEnd = Math.max(safeStart, Math.min(end, editor.state.doc.content.size));

      editor
        .chain()
        .focus()
        .setTextSelection({ from: safeStart, to: safeEnd })
        .run();

      const selectedText = editor.state.doc.textBetween(safeStart, safeEnd, ' ');
      setSelectionRange({ start: safeStart, end: safeEnd, text: selectedText });
    },
    [editor]
  );

  const handleNavigateToIssue = useCallback(
    (start: number, end: number) => {
      setActiveHighlight({ start, end, type: 'issue' });
      setSelection(start, end);
    },
    [setSelection]
  );

  const scrollToPosition = useCallback(
    (position: number) => {
      if (!editor) return;
      editor.chain().focus().setTextSelection(position).run();
    },
    [editor]
  );

  const getEditorContext = useCallback((): AgentEditorContext => ({
    cursorPosition,
    selection: selectionRange,
    totalLength: currentText.length,
  }), [cursorPosition, selectionRange, currentText.length]);

  return {
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
  };
};
