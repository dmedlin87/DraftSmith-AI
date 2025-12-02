import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CommentMark } from '@/features/editor/extensions/CommentMark';
import { useTiptapSync } from '@/features/editor/hooks/useTiptapSync';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { InlineComment } from '@/types/schema';

const createFakeDoc = (size: number) => ({ content: { size } });
const baseComment: Omit<InlineComment, 'id' | 'startIndex' | 'endIndex' | 'severity' | 'dismissed'> = {
  type: 'plot',
  issue: 'issue',
  suggestion: 'suggestion',
  quote: 'quote',
  createdAt: 0,
};

describe('CommentMark extension commands', () => {
  it('removes matching nested marks and leaves unrelated marks', () => {
    const cfg = (CommentMark as any).config;
    const commands = cfg.addCommands();

    const removeMark = vi.fn();
    const matching = { type: { name: CommentMark.name }, attrs: { commentId: 'n1' } } as any;
    const unrelated = { type: { name: 'link' }, attrs: { commentId: 'n1' } } as any;

    const tr = { removeMark } as any;
    const doc = {
      nodesBetween: (from: number, to: number, cb: (node: any, pos: number) => void) => {
        cb({ isText: true, nodeSize: 2, marks: [unrelated, matching] }, from);
        cb({ isText: true, nodeSize: 3, marks: [matching] }, from + 2);
      },
    };

    const state = { doc, selection: { from: 0, to: 5 } } as any;
    const dispatch = vi.fn();

    const handler = commands.unsetComment('n1');
    const result = handler({ tr, state, dispatch } as any);

    expect(removeMark).toHaveBeenCalledTimes(2);
    expect(removeMark).toHaveBeenNthCalledWith(1, 0, 2, matching);
    expect(removeMark).toHaveBeenNthCalledWith(2, 2, 5, matching);
    expect(dispatch).toHaveBeenCalledWith(tr);
    expect(result).toBe(true);
  });

  it('returns true for empty selections even when no marks are removed', () => {
    const cfg = (CommentMark as any).config;
    const commands = cfg.addCommands();

    const removeMark = vi.fn();
    const tr = { removeMark } as any;
    const doc = {
      nodesBetween: vi.fn(),
    };

    const state = { doc, selection: { from: 3, to: 3 } } as any;
    const handler = commands.unsetComment('none');
    const result = handler({ tr, state, dispatch: undefined } as any);

    expect(doc.nodesBetween).toHaveBeenCalled();
    expect(removeMark).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

describe('Comment decorations', () => {
  let decorationInline: any;
  let decorationSetCreate: any;

  beforeEach(() => {
    decorationInline = vi.spyOn(Decoration, 'inline').mockImplementation(
      (from: number, to: number, attrs: Record<string, unknown>) => ({ from, to, attrs }) as any
    );
    decorationSetCreate = vi
      .spyOn(DecorationSet, 'create')
      .mockImplementation((_doc: any, decorations: any[]) => ({ decorations } as any));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates decorations for valid inline comments and updates with new refs', () => {
    const comments: InlineComment[] = [
      { id: 'c1', startIndex: 1, endIndex: 3, severity: 'info', dismissed: false, ...baseComment },
    ];

    const { result, rerender } = renderHook(({ inlineComments }) =>
      useTiptapSync({ analysisHighlights: [], inlineComments, onCommentClick: undefined }),
    {
      initialProps: { inlineComments: comments },
    });

    const plugin = result.current.CommentDecorations;
    const state = { doc: createFakeDoc(10) } as any;

    plugin.props.decorations(state);
    expect(decorationInline).toHaveBeenCalledWith(1, 3, expect.objectContaining({
      class: 'inline-comment-highlight decoration-base decoration-info',
      'data-comment-id': 'c1',
    }));
    expect(decorationSetCreate).toHaveBeenCalledWith(state.doc, expect.any(Array));

    // Update refs to a new comment range and ensure plugin uses new data
    const updated: InlineComment[] = [
      { id: 'c2', startIndex: 2, endIndex: 5, severity: 'error', dismissed: false, ...baseComment },
    ];
    rerender({ inlineComments: updated });

    decorationInline.mockClear();
    plugin.props.decorations(state);
    expect(decorationInline).toHaveBeenCalledWith(2, 5, expect.objectContaining({
      class: 'inline-comment-highlight decoration-base decoration-error',
      'data-comment-id': 'c2',
    }));
  });

  it('ignores dismissed, invalid, or out-of-bounds comments', () => {
    const comments: InlineComment[] = [
      { id: 'c1', startIndex: 2, endIndex: 2, severity: 'warning', dismissed: false, ...baseComment },
      { id: 'c2', startIndex: 0, endIndex: 12, severity: 'info', dismissed: false, ...baseComment },
      { id: 'c3', startIndex: 1, endIndex: 4, severity: 'warning', dismissed: true, ...baseComment },
    ];

    const { result } = renderHook(() =>
      useTiptapSync({ analysisHighlights: [], inlineComments: comments, onCommentClick: undefined })
    );

    const plugin = result.current.CommentDecorations;
    const state = { doc: createFakeDoc(10) } as any;

    const decorationSet = plugin.props.decorations(state);
    expect(decorationInline).not.toHaveBeenCalled();
    expect(decorationSet).toEqual({ decorations: [] });
  });

  it('refreshDecorations dispatches only when editor is active', () => {
    const { result } = renderHook(() =>
      useTiptapSync({ analysisHighlights: [], inlineComments: [], onCommentClick: undefined })
    );

    const refresh = result.current.refreshDecorations;
    const dispatch = vi.fn();
    const editor = {
      isDestroyed: false,
      view: { dispatch },
      state: { tr: { setMeta: vi.fn().mockReturnThis() } },
    } as any;

    refresh(editor);
    expect(dispatch).toHaveBeenCalled();

    dispatch.mockClear();
    refresh(undefined as any);
    refresh({ ...editor, isDestroyed: true });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
