import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { Markdown } from 'tiptap-markdown';
import { CommentMark } from '../extensions/CommentMark';
import type { AnyExtension } from '@tiptap/core';
import { InlineComment } from '@/types/schema';
import { useTiptapSync, useDebouncedUpdate, type HighlightItem } from '../hooks/useTiptapSync';

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

  // Use optimized hook for Tiptap sync (replaces 3 separate useEffect hooks)
  const { installPlugins, refreshDecorations } = useTiptapSync({
    analysisHighlights,
    inlineComments,
    onCommentClick,
  });

  // Debounced update to prevent re-renders on every keystroke (300ms default)
  const debouncedOnUpdate = useDebouncedUpdate(onUpdate, 300);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      CommentMark as AnyExtension,
    ] as unknown as AnyExtension[],
    content: content, 
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[60vh] outline-none',
        style: 'font-family: "Crimson Pro", serif; font-size: 1.125rem; line-height: 2; color: var(--ink-800);'
      },
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
        const viewportHeight = window.innerHeight;
        const targetY = viewportHeight * 0.45;
        const scrollContainer = editorContainerRef.current?.closest('.overflow-y-auto');
        
        if (scrollContainer && coords) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const cursorYInContainer = coords.top - containerRect.top;
          const scrollOffset = cursorYInContainer - targetY;
          
          if (Math.abs(scrollOffset) > 50) {
            scrollContainer.scrollBy({
              top: scrollOffset,
              behavior: 'smooth'
            });
          }
        }
      }
    },
  });

  // Sync external content changes (when not focused)
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = (editor.storage as any).markdown.getMarkdown();
      if (currentMarkdown !== content && !editor.isFocused) {
        editor.commands.setContent(content);
      }
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