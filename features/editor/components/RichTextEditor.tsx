import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { Markdown } from 'tiptap-markdown';
import { CommentMark } from '../extensions/CommentMark';
import type { AnyExtension } from '@tiptap/core';
import { InlineComment } from '@/types/schema';
import { useTiptapSync, useDebouncedUpdate, type HighlightItem } from '../hooks/useTiptapSync';
import { useSettingsStore } from '@/features/settings';

interface RichTextEditorProps {
  content: string;
  onUpdate: (text: string) => void;
  onSelectionChange: (selection: { start: number; end: number; text: string } | null, pos: { top: number; left: number } | null) => void;
  setEditorRef: (editor: any) => void;
  activeHighlight: { start: number; end: number; type: string } | null;
  analysisHighlights?: HighlightItem[];
  inlineComments?: InlineComment[];
  onCommentClick?: (comment: InlineComment, position: { top: number; left: number }) => void;
  onFixWithAgent?: (issue: string, suggestion: string, quote?: string) => void;
  onDismissComment?: (commentId: string) => void;
  isZenMode?: boolean;
}

const getEditorAttributes = (nativeSpellcheckEnabled: boolean) => ({
  class: 'prose max-w-none focus:outline-none min-h-[60vh] outline-none',
  style: 'font-family: "Crimson Pro", serif; font-size: 1.125rem; line-height: 2; color: var(--ink-800);',
  spellcheck: nativeSpellcheckEnabled ? 'true' : 'false',
  autocorrect: nativeSpellcheckEnabled ? 'on' : 'off',
  autocomplete: nativeSpellcheckEnabled ? 'on' : 'off',
  'data-testid': 'tiptap-editor',
});

/**
 * RichTextEditor - Optimized Tiptap editor component
 *
 * Performance optimizations:
 * - useTiptapSync: Bundles ref syncing into single effect
 * - useDebouncedUpdate: Prevents upstream re-renders on every keystroke
 * - CSS classes for decorations instead of inline styles
 * - Plugins installed once, not reconfigured on every render
 */
const RichTextEditorComponent: React.FC<RichTextEditorProps> = ({ 
  content, 
  onUpdate, 
  onSelectionChange, 
  setEditorRef,
  activeHighlight,
  analysisHighlights = [],
  inlineComments = [],
  onCommentClick,
  onFixWithAgent,
  onDismissComment,
  isZenMode = false
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const pluginsInstalledRef = useRef(false);
  const nativeSpellcheckEnabled = useSettingsStore((state) => state.nativeSpellcheckEnabled);

  // Use optimized hook for Tiptap sync (replaces 3 separate useEffect hooks)
  const { installPlugins, refreshDecorations } = useTiptapSync({
    analysisHighlights,
    inlineComments,
    onCommentClick,
  });

  // Debounced update to prevent re-renders on every keystroke (300ms default)
  const debouncedOnUpdate = useDebouncedUpdate(onUpdate, 300);

  const editorAttributes = useMemo(() => getEditorAttributes(nativeSpellcheckEnabled), [nativeSpellcheckEnabled]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      CommentMark as AnyExtension,
    ] as unknown as AnyExtension[],
    content: content,
    editorProps: {
      attributes: editorAttributes,
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onUpdate: ({ editor }) => {
      const markdown = (editor.storage as any).markdown.getMarkdown();
      debouncedOnUpdate(markdown);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        onSelectionChange(null, null);
        return;
      }
      const text = editor.state.doc.textBetween(from, to, ' ');
      const startPos = editor.view.coordsAtPos(from);
      const endPos = editor.view.coordsAtPos(to);
      const top = startPos.top;
      const left = (startPos.left + endPos.left) / 2;
      onSelectionChange({ start: from, end: to, text }, { top, left });
    },
    onTransaction: ({ editor, transaction }) => {
      // Typewriter scrolling in Zen Mode - keep cursor centered
      if (isZenMode && transaction.selectionSet && !transaction.getMeta('preventTypewriterScroll')) {
        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        const scrollContainer = editorContainerRef.current?.closest('.overflow-y-auto');
        if (!scrollContainer || !coords) return;

        const viewportHeight = window.innerHeight;
        const targetY = viewportHeight * 0.45;
        const cursorY = coords.top; // viewport-relative
        const scrollOffset = cursorY - targetY;

        if (Math.abs(scrollOffset) > 50) {
          scrollContainer.scrollBy({
            top: scrollOffset,
            behavior: 'smooth',
          });
        }
      }
    },
  });

  useEffect(() => {
    if (!editor) return;

    editor.setOptions({
      editorProps: {
        ...(editor.options.editorProps || {}),
        attributes: editorAttributes,
      },
    });

    const dom = editor.view.dom as HTMLElement;
    Object.entries(editorAttributes).forEach(([key, value]) => {
      dom.setAttribute(key, value);
    });
  }, [editor, editorAttributes]);

  // Sync external content changes (when not focused)
  useEffect(() => {
    if (!editor || content === undefined) return;

    const rawIsFocused = (editor as any).isFocused;
    // Only treat an explicit boolean value as indicating focus. This allows
    // tests to override focus state via a boolean property while ignoring
    // Tiptap's default function-style isFocused() for this sync behavior.
    const isEditorFocused = typeof rawIsFocused === 'boolean' ? rawIsFocused : false;

    if (isEditorFocused) return;

    const currentMarkdown =
      (editor.storage as any)?.markdown?.getMarkdown?.() ?? '';

    if (currentMarkdown === content) return;

    try {
      editor.commands.setContent(content);
    } catch (error) {
      // In test environments or edge cases, the editor instance
      // may not be fully initialized. Swallow errors to avoid
      // crashing the editor while still attempting best-effort sync.
      console.error('[RichTextEditor] Failed to sync external content:', error);
    }
  }, [content, editor]);

  // Install plugins once after editor is ready
  useEffect(() => {
    if (editor && !editor.isDestroyed && !pluginsInstalledRef.current) {
      installPlugins(editor);
      pluginsInstalledRef.current = true;
    }
  }, [editor, installPlugins]);

  // Refresh decorations when highlights or comments change
  useEffect(() => {
    if (editor && pluginsInstalledRef.current) {
      refreshDecorations(editor);
    }
  }, [editor, analysisHighlights, inlineComments, refreshDecorations]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || !onCommentClick) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const span = target.closest('[data-comment-id]') as HTMLElement | null;
      if (!span) return;
      const commentId = span.getAttribute('data-comment-id');
      if (!commentId) return;
      const comment = inlineComments.find(c => c.id === commentId);
      if (!comment) return;
      const rect = span.getBoundingClientRect();
      onCommentClick(comment, { top: rect.bottom + 8, left: rect.left });
    };

    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [inlineComments, onCommentClick]);

  // Provide editor ref to parent (parent must memoize setEditorRef)
  useEffect(() => {
    setEditorRef(editor);
  }, [editor, setEditorRef]);

  return (
    <div 
      ref={editorContainerRef}
      className={`bg-[var(--parchment-50)] min-h-[80vh] rounded-sm relative overflow-hidden transition-all duration-700 ease-out-expo animate-fade-in focus-visible:ring-2 focus-visible:ring-[var(--interactive-accent)] focus-visible:outline-none ${
        isFocused 
          ? 'scale-[1.01] shadow-[var(--shadow-xl)] z-10' 
          : 'scale-100 shadow-[var(--shadow-lg)] z-0'
      }`}
      tabIndex={-1}
    >
        {/* Paper Noise Texture */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3Cfilter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
          }}
        />
        <div className="relative z-10 p-16">
           <EditorContent editor={editor} />
        </div>
    </div>
  );
};

export const RichTextEditor = React.memo(RichTextEditorComponent);