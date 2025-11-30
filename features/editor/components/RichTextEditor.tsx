import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { Markdown } from 'tiptap-markdown';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CommentMark } from '../extensions/CommentMark';
import type { AnyExtension } from '@tiptap/core';
import { InlineComment } from '@/types/schema';

const ANALYSIS_PLUGIN_KEY = new PluginKey('analysis-decorations');
const COMMENT_PLUGIN_KEY = new PluginKey('comment-decorations');

interface HighlightItem {
  start: number;
  end: number;
  color: string;
  title?: string;
}

interface RichTextEditorProps {
  content: string;
  onUpdate: (text: string) => void;
  onSelectionChange: (selection: { start: number; end: number; text: string } | null, pos: { top: number; left: number } | null) => void;
  setEditorRef: (editor: any) => void;
  activeHighlight: { start: number; end: number; type: string } | null;
  analysisHighlights?: HighlightItem[];
  // Quill AI 3.0: Inline Comments
  inlineComments?: InlineComment[];
  onCommentClick?: (comment: InlineComment, position: { top: number; left: number }) => void;
  onFixWithAgent?: (issue: string, suggestion: string, quote?: string) => void;
  onDismissComment?: (commentId: string) => void;
  // Quill AI 3.0: Zen Mode
  isZenMode?: boolean;
}

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

  const analysisHighlightsRef = useRef<HighlightItem[]>(analysisHighlights);
  const inlineCommentsRef = useRef<InlineComment[]>(inlineComments);
  const onCommentClickRef = useRef<typeof onCommentClick>();

  useEffect(() => {
    analysisHighlightsRef.current = analysisHighlights;
  }, [analysisHighlights]);

  useEffect(() => {
    inlineCommentsRef.current = inlineComments;
  }, [inlineComments]);

  useEffect(() => {
    onCommentClickRef.current = onCommentClick;
  }, [onCommentClick]);

  const AnalysisDecorations = useMemo(() => {
    return new Plugin({
      key: ANALYSIS_PLUGIN_KEY,
      props: {
        decorations(state) {
          const { doc } = state;
          const decorations: Decoration[] = [];
          const highlights = analysisHighlightsRef.current;

          highlights.forEach(h => {
            if (h.start < h.end && h.end <= doc.content.size) {
              decorations.push(
                Decoration.inline(h.start, h.end, {
                  style: `background-color: ${h.color}20; border-bottom: 2px solid ${h.color}; cursor: help;`,
                  title: h.title || '',
                })
              );
            }
          });

          return DecorationSet.create(doc, decorations);
        },
      },
    });
  }, []);

  // Comment decorations plugin
  const CommentDecorations = useMemo(() => {
    return new Plugin({
      key: COMMENT_PLUGIN_KEY,
      props: {
        decorations(state) {
          const { doc } = state;
          const decorations: Decoration[] = [];
          const comments = inlineCommentsRef.current;

          comments
            .filter(c => !c.dismissed)
            .forEach(comment => {
              if (comment.startIndex < comment.endIndex && comment.endIndex <= doc.content.size) {
                const severityColors = {
                  error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgb(239, 68, 68)' },
                  warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgb(245, 158, 11)' },
                  info: { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgb(99, 102, 241)' },
                };
                const colors = severityColors[comment.severity] || severityColors.warning;

                decorations.push(
                  Decoration.inline(comment.startIndex, comment.endIndex, {
                    class: 'inline-comment-highlight',
                    style: `background-color: ${colors.bg}; border-bottom: 2px solid ${colors.border}; cursor: pointer;`,
                    'data-comment-id': comment.id,
                  })
                );
              }
            });

          return DecorationSet.create(doc, decorations);
        },
        handleClick(view, pos, event) {
          const target = event.target as HTMLElement;
          const commentId = target.getAttribute('data-comment-id');
          if (commentId) {
            const comments = inlineCommentsRef.current;
            const onClick = onCommentClickRef.current;
            const comment = comments.find(c => c.id === commentId);
            if (comment && onClick) {
              const rect = target.getBoundingClientRect();
              onClick(comment, { top: rect.bottom + 8, left: rect.left });
              return true;
            }
          }
          return false;
        },
      },
    });
  }, []);

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
      onUpdate(markdown);
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
        const targetY = viewportHeight * 0.45; // Slightly above center feels better
        const scrollContainer = editorContainerRef.current?.closest('.overflow-y-auto');
        
        if (scrollContainer && coords) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const cursorYInContainer = coords.top - containerRect.top;
          const scrollOffset = cursorYInContainer - targetY;
          
          if (Math.abs(scrollOffset) > 50) { // Only scroll if cursor is more than 50px from center
            scrollContainer.scrollBy({
              top: scrollOffset,
              behavior: 'smooth'
            });
          }
        }
      }
    },
  });

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = (editor.storage as any).markdown.getMarkdown();
      if (currentMarkdown !== content && !editor.isFocused) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const state = editor.state;
    const plugins = state.plugins
      .filter(p => {
        const keyObj = p.spec.key as PluginKey | undefined;
        const keyName = (keyObj as any)?.key ?? (p as any)?.key;
        return keyName !== 'analysis-decorations' && keyName !== 'comment-decorations';
      })
      .concat([AnalysisDecorations, CommentDecorations]);

    const newState = state.reconfigure({ plugins });
    editor.view.updateState(newState);
  }, [editor, AnalysisDecorations, CommentDecorations]);

  useEffect(() => {
    // Parent must memoize setEditorRef to avoid render loops
    setEditorRef(editor);
  }, [editor]);

  return (
    <div 
      ref={editorContainerRef}
      className={`bg-[var(--parchment-50)] min-h-[80vh] rounded-sm relative overflow-hidden transition-all duration-700 ease-out-expo animate-fade-in ${
        isFocused 
          ? 'scale-[1.01] shadow-[var(--shadow-xl)] z-10' 
          : 'scale-100 shadow-[var(--shadow-lg)] z-0'
      }`}
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