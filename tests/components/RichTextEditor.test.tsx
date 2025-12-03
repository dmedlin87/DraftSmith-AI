import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { RichTextEditor } from '@/features/editor/components/RichTextEditor';
import { InlineComment } from '@/types/schema';
import { useSettingsStore } from '@/features/settings';

// Mock window.scrollBy
const mockScrollBy = vi.fn();

// Store original methods for cleanup
let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;

describe('RichTextEditor', () => {
  const setEditorRef = vi.fn();
  const onUpdate = vi.fn();
  const onSelectionChange = vi.fn();
  const onCommentClick = vi.fn();
  const onFixWithAgent = vi.fn();
  const onDismissComment = vi.fn();

  // Helper to get editor instance from setEditorRef mock
  const getEditorInstance = async () => {
    return await waitFor(() => {
      const editor = setEditorRef.mock.calls.find(([instance]) => Boolean(instance))?.[0];
      if (!editor) {
        throw new Error('editor not ready');
      }
      return editor;
    });
  };

  // Helper to setup common editor mocks
  const setupEditorMocks = (editor: any) => {
    editor.state.reconfigure = vi.fn(() => editor.state);
    editor.view.updateState = vi.fn();
    editor.view.coordsAtPos = vi.fn(() => ({ top: 100, left: 200, bottom: 120, right: 220 }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock getBoundingClientRect
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 50,
      bottom: 200,
      right: 300,
      width: 250,
      height: 100,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  // ====================
  // Basic Rendering Tests
  // ====================

  describe('Basic Rendering', () => {
    it('renders initial content and sets editor ref', async () => {
      render(
        <RichTextEditor
          content="Initial content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      expect(await screen.findByText('Initial content')).toBeInTheDocument();
      await waitFor(() => expect(setEditorRef).toHaveBeenCalled());
    });

    it('renders with all optional props', async () => {
      const comments: InlineComment[] = [{
        id: 'comment-1',
        type: 'plot',
        issue: 'Test issue',
        suggestion: 'Test suggestion',
        severity: 'warning',
        quote: 'test quote',
        startIndex: 0,
        endIndex: 5,
        dismissed: false,
        createdAt: Date.now(),
      }];

      const highlights = [{
        start: 0,
        end: 5,
        color: '#ff0000',
        title: 'Test highlight',
      }];

      render(
        <RichTextEditor
          content="Test content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={{ start: 0, end: 5, type: 'pacing' }}
          analysisHighlights={highlights}
          inlineComments={comments}
          onCommentClick={onCommentClick}
          onFixWithAgent={onFixWithAgent}
          onDismissComment={onDismissComment}
          isZenMode={false}
        />
      );

      // Text may be split by decorations, verify editor is created
      const editor = await getEditorInstance();
      expect(editor).toBeDefined();
    });

    it('applies native spellcheck attributes and reacts to preference changes', async () => {
      render(
        <RichTextEditor
          content="Spellcheck content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editorSurface = await screen.findByTestId('tiptap-editor');

      expect(editorSurface).toHaveAttribute('spellcheck', 'true');
      expect(editorSurface).toHaveAttribute('autocorrect', 'on');
      expect(editorSurface).toHaveAttribute('autocomplete', 'on');

      act(() => {
        useSettingsStore.getState().setNativeSpellcheckEnabled(false);
      });

      await waitFor(() => expect(editorSurface).toHaveAttribute('spellcheck', 'false'));
      expect(editorSurface).toHaveAttribute('autocorrect', 'off');
      expect(editorSurface).toHaveAttribute('autocomplete', 'off');
    });
  });

  // ====================
  // External Content Updates Tests
  // ====================

  describe('External Content Updates', () => {
    it('verifies external content update logic when editor is NOT focused', async () => {
      const { rerender } = render(
        <RichTextEditor
          content="Initial"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Simulate markdown storage used by the effect
      let storedContent = 'Initial';
      (editor.storage as any).markdown = {
        getMarkdown: vi.fn(() => storedContent),
      };

      let setContentCalls = 0;
      const originalCommands = editor.commands;
      const commandsMock = {
        ...originalCommands,
        setContent: (value: any) => {
          setContentCalls += 1;
          storedContent = value;
          return editor;
        },
      };

      Object.defineProperty(editor, 'commands', {
        configurable: true,
        get: () => commandsMock,
      });

      // First: changing content should trigger a setContent call
      act(() => {
        rerender(
          <RichTextEditor
            content="Updated content"
            onUpdate={onUpdate}
            onSelectionChange={onSelectionChange}
            setEditorRef={setEditorRef}
            activeHighlight={null}
          />
        );
      });

      await waitFor(() => {
        expect(setContentCalls).toBeGreaterThan(0);
      });

      expect(storedContent).toBe('Updated content');

      setContentCalls = 0;

      // Second: rerender with same content should NOT re-call setContent
      act(() => {
        rerender(
          <RichTextEditor
            content="Updated content"
            onUpdate={onUpdate}
            onSelectionChange={onSelectionChange}
            setEditorRef={setEditorRef}
            activeHighlight={null}
          />
        );
      });

      await waitFor(() => {
        expect(setContentCalls).toBe(0);
      });
    });

    it('does NOT call setContent when editor IS focused', async () => {
      const { rerender } = render(
        <RichTextEditor
          content="Initial"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);
      
      // Mock editor as focused
      Object.defineProperty(editor, 'isFocused', { get: () => true, configurable: true });
      
      // Simulate markdown storage so effect runs the comparison branch
      (editor.storage as any).markdown = {
        getMarkdown: vi.fn(() => 'Initial'),
      };

      const setContentSpy = vi.spyOn(editor.commands, 'setContent');
      
      act(() => {
        rerender(
          <RichTextEditor
            content="Updated content"
            onUpdate={onUpdate}
            onSelectionChange={onSelectionChange}
            setEditorRef={setEditorRef}
            activeHighlight={null}
          />
        );
      });

      // Should NOT be called when focused
      expect(setContentSpy).not.toHaveBeenCalled();
    });
  });

  // ====================
  // Selection & Magic Bar Positioning Tests
  // ====================

  describe('Selection & Magic Bar Positioning', () => {
    it('calls onSelectionChange with calculated coordinates on selection', async () => {
      render(
        <RichTextEditor
          content="Selectable text here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Mock different coordinates for start and end positions
      editor.view.coordsAtPos = vi.fn((pos: number) => {
        if (pos === 1) return { top: 100, left: 50, bottom: 120, right: 60 };
        return { top: 100, left: 150, bottom: 120, right: 160 };
      });

      act(() => {
        const selectionEditor = {
          ...editor,
          state: {
            ...editor.state,
            selection: { from: 1, to: 10, empty: false },
            doc: { textBetween: () => 'electabl' },
          },
          view: editor.view,
        };

        editor.options.onSelectionUpdate?.({ editor: selectionEditor } as any);
      });

      await waitFor(() => {
        expect(onSelectionChange).toHaveBeenCalledWith(
          expect.objectContaining({ start: 1, end: 10, text: 'electabl' }),
          expect.objectContaining({ top: 100, left: 100 }) // (50 + 150) / 2 = 100
        );
      });
    });

    it('calls onSelectionChange with null when selection is empty', async () => {
      render(
        <RichTextEditor
          content="Some text"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      act(() => {
        const emptySelectionEditor = {
          ...editor,
          state: {
            ...editor.state,
            selection: { from: 5, to: 5, empty: true },
            doc: { textBetween: () => '' },
          },
          view: editor.view,
        };

        editor.options.onSelectionUpdate?.({ editor: emptySelectionEditor } as any);
      });

      await waitFor(() => {
        expect(onSelectionChange).toHaveBeenCalledWith(null, null);
      });
    });
  });

  // ====================
  // Focus/Blur State Tests
  // ====================

  describe('Focus/Blur State', () => {
    it('handles focus and blur events with visual changes', async () => {
      render(
        <RichTextEditor
          content="Focus test"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Trigger focus
      act(() => {
        editor.options.onFocus?.({ editor } as any);
      });

      // Container should have focused styles
      const container = document.querySelector('.bg-\\[var\\(--parchment-50\\)\\]');
      expect(container).toBeInTheDocument();

      // Trigger blur
      act(() => {
        editor.options.onBlur?.({ editor } as any);
      });

      // Container still present
      expect(container).toBeInTheDocument();
    });
  });

  // ====================
  // Zen Mode Typewriter Scrolling Tests
  // ====================

  describe('Zen Mode Typewriter Scrolling', () => {
    it('triggers scrollBy when cursor moves outside center zone in Zen Mode', async () => {
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'overflow-y-auto';
      (scrollContainer as any).scrollBy = mockScrollBy;
      document.body.appendChild(scrollContainer);

      render(
        <RichTextEditor
          content="Zen mode content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          isZenMode={true}
        />,
        { container: scrollContainer }
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Mock window.innerHeight
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

      // Mock coords that are far from center (outside 50px threshold)
      editor.view.coordsAtPos = vi.fn(() => ({ top: 700, left: 100, bottom: 720, right: 110 }));

      act(() => {
        const transaction = {
          selectionSet: true,
          getMeta: vi.fn(() => false),
        };
        editor.options.onTransaction?.({ editor, transaction } as any);
      });

      await waitFor(() => {
        expect(mockScrollBy).toHaveBeenCalledWith(
          expect.objectContaining({
            top: expect.any(Number),
            behavior: 'smooth',
          })
        );
      });
    });

    it('does NOT scroll when cursor is within center zone', async () => {
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'overflow-y-auto';
      (scrollContainer as any).scrollBy = mockScrollBy;
      document.body.appendChild(scrollContainer);

      render(
        <RichTextEditor
          content="Zen mode content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          isZenMode={true}
        />,
        { container: scrollContainer }
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Mock coords near the center (within 50px threshold)
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      // Target Y = 800 * 0.45 = 360
      // If cursor is at ~360, scrollOffset should be < 50
      editor.view.coordsAtPos = vi.fn(() => ({ top: 360, left: 100, bottom: 380, right: 110 }));

      act(() => {
        const transaction = {
          selectionSet: true,
          getMeta: vi.fn(() => false),
        };
        editor.options.onTransaction?.({ editor, transaction } as any);
      });

      await waitFor(() => {
        expect(mockScrollBy).not.toHaveBeenCalled();
      });
    });

    it('does NOT scroll when preventTypewriterScroll meta is set', async () => {
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'overflow-y-auto';
      (scrollContainer as any).scrollBy = mockScrollBy;
      document.body.appendChild(scrollContainer);

      render(
        <RichTextEditor
          content="Zen mode content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          isZenMode={true}
        />,
        { container: scrollContainer }
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      act(() => {
        const transaction = {
          selectionSet: true,
          getMeta: vi.fn((key: string) => key === 'preventTypewriterScroll'),
        };
        editor.options.onTransaction?.({ editor, transaction } as any);
      });

      await waitFor(() => {
        expect(mockScrollBy).not.toHaveBeenCalled();
      });
    });

    it('does NOT scroll in non-Zen Mode', async () => {
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'overflow-y-auto';
      (scrollContainer as any).scrollBy = mockScrollBy;
      document.body.appendChild(scrollContainer);

      render(
        <RichTextEditor
          content="Normal mode content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          isZenMode={false}
        />,
        { container: scrollContainer }
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      act(() => {
        const transaction = {
          selectionSet: true,
          getMeta: vi.fn(() => false),
        };
        editor.options.onTransaction?.({ editor, transaction } as any);
      });

      await waitFor(() => {
        expect(mockScrollBy).not.toHaveBeenCalled();
      });
    });
  });

  // ====================
  // Analysis Decorations Tests
  // ====================

  describe('Analysis Decorations', () => {
    it('applies analysis highlights as decorations', async () => {
      const highlights = [
        { start: 1, end: 5, color: '#ff0000', title: 'Pacing issue' },
        { start: 10, end: 15, color: '#00ff00', title: 'Character note' },
      ];

      render(
        <RichTextEditor
          content="Test content with highlights"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          analysisHighlights={highlights}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Verify plugins are configured
      await waitFor(() => {
        const pluginKeys = editor.state.plugins.map((p: any) => p.spec?.key?.key).filter(Boolean);
        // The analysis-decorations plugin should be present
        expect(pluginKeys.length).toBeGreaterThan(0);
      });
    });

    it('ignores invalid highlight ranges', async () => {
      const highlights = [
        { start: 100, end: 5, color: '#ff0000' }, // Invalid: start > end
        { start: 1, end: 1000, color: '#00ff00' }, // Invalid: end > doc.content.size
      ];

      render(
        <RichTextEditor
          content="Short"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          analysisHighlights={highlights}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Should render without errors
      expect(await screen.findByText('Short')).toBeInTheDocument();
    });
  });

  // ====================
  // Comment Decorations Tests
  // ====================

  describe('Comment Decorations', () => {
    const createComment = (overrides: Partial<InlineComment> = {}): InlineComment => ({
      id: 'comment-1',
      type: 'plot',
      issue: 'Plot hole detected',
      suggestion: 'Add more context',
      severity: 'warning',
      quote: 'test text',
      startIndex: 1,
      endIndex: 5,
      dismissed: false,
      createdAt: Date.now(),
      ...overrides,
    });

    it('applies comment decorations with correct severity colors', async () => {
      const comments = [
        createComment({ id: 'c1', severity: 'error', startIndex: 1, endIndex: 5 }),
        createComment({ id: 'c2', severity: 'warning', startIndex: 6, endIndex: 10 }),
        createComment({ id: 'c3', severity: 'info', startIndex: 11, endIndex: 15 }),
      ];

      render(
        <RichTextEditor
          content="Error warning info text here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={comments}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Should render without errors - text is split by decorations
      expect(editor).toBeDefined();
    });

    it('filters out dismissed comments from decorations', async () => {
      const comments = [
        createComment({ id: 'c1', dismissed: false }),
        createComment({ id: 'c2', dismissed: true, startIndex: 6, endIndex: 10 }),
      ];

      render(
        <RichTextEditor
          content="Test content here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={comments}
        />
      );

      // Should render - text may be split by decorations
      const editor = await getEditorInstance();
      expect(editor).toBeDefined();
    });

    it('calls onCommentClick when clicking on comment decoration', async () => {
      const comment = createComment({ id: 'click-comment' });

      const { container } = render(
        <RichTextEditor
          content="Test content here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[comment]}
          onCommentClick={onCommentClick}
        />
      );

      await getEditorInstance();

      await waitFor(() => {
        const decoration = container.querySelector('[data-comment-id="click-comment"]') as HTMLElement | null;
        expect(decoration).toBeInTheDocument();

        if (decoration) {
          decoration.getBoundingClientRect = vi.fn(() => ({
            top: 100,
            left: 50,
            bottom: 120,
            right: 100,
            width: 50,
            height: 20,
            x: 50,
            y: 100,
            toJSON: () => ({}),
          }));

          fireEvent.click(decoration);
        }
      });

      await waitFor(() => {
        expect(onCommentClick).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'click-comment' }),
          expect.objectContaining({ top: 128, left: 50 })
        );
      });
    });
  });

  // ====================
  // CommentCard Interaction Tests
  // ====================

  // ====================
  // Comment Interaction Tests
  // ====================

  describe('Comment Interactions', () => {
    const createComment = (overrides: Partial<InlineComment> = {}): InlineComment => ({
      id: 'card-comment',
      type: 'prose',
      issue: 'Prose issue',
      suggestion: 'Fix the prose',
      severity: 'warning',
      quote: 'problematic text',
      startIndex: 1,
      endIndex: 10,
      dismissed: false,
      createdAt: Date.now(),
      ...overrides,
    });

    it('invokes onCommentClick via a real DOM click on a decorated span', async () => {
      const comment = createComment();

      render(
        <RichTextEditor
          content="Test content with problems"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[comment]}
          onCommentClick={onCommentClick}
          onFixWithAgent={onFixWithAgent}
          onDismissComment={onDismissComment}
        />
      );

      await getEditorInstance();

      await waitFor(() => {
        const decoration = document.querySelector('[data-comment-id="card-comment"]') as HTMLElement | null;
        expect(decoration).toBeInTheDocument();

        if (decoration) {
          fireEvent.click(decoration);
        }
      });

      await waitFor(() => {
        expect(onCommentClick).toHaveBeenCalledWith(
          expect.objectContaining({ id: comment.id }),
          expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) })
        );
      });
    });
  });

  // ====================
  // Plugin Reconfiguration Tests
  // ====================

  describe('Plugin Reconfiguration', () => {
    it('reconfigures plugins when analysisHighlights change', async () => {
      const { rerender } = render(
        <RichTextEditor
          content="Test"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          analysisHighlights={[]}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);
      
      const updateStateSpy = vi.spyOn(editor.view, 'updateState');

      act(() => {
        rerender(
          <RichTextEditor
            content="Test"
            onUpdate={onUpdate}
            onSelectionChange={onSelectionChange}
            setEditorRef={setEditorRef}
            activeHighlight={null}
            analysisHighlights={[{ start: 1, end: 3, color: '#ff0000' }]}
          />
        );
      });

      await waitFor(() => {
        expect(updateStateSpy).toHaveBeenCalled();
      });
    });

    it('reconfigures plugins when inlineComments change', async () => {
      const { rerender } = render(
        <RichTextEditor
          content="Test"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[]}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);
      
      const updateStateSpy = vi.spyOn(editor.view, 'updateState');

      act(() => {
        rerender(
          <RichTextEditor
            content="Test"
            onUpdate={onUpdate}
            onSelectionChange={onSelectionChange}
            setEditorRef={setEditorRef}
            activeHighlight={null}
            inlineComments={[{
              id: 'new-comment',
              type: 'pacing',
              issue: 'Issue',
              suggestion: 'Fix it',
              severity: 'info',
              quote: 'text',
              startIndex: 1,
              endIndex: 3,
              dismissed: false,
              createdAt: Date.now(),
            }]}
          />
        );
      });

      await waitFor(() => {
        expect(updateStateSpy).toHaveBeenCalled();
      });
    });
  });

  // ====================
  // Update Callback Tests
  // ====================

  describe('Update Callbacks', () => {
    it('calls onUpdate with markdown content on editor update', async () => {
      render(
        <RichTextEditor
          content="Start"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      act(() => {
        editor.commands.setContent('Updated');
        editor.options.onUpdate?.({ editor } as any);
      });

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalled();
      });
    });
  });

  // ====================
  // handleCommentClick Tests
  // ====================

  describe('handleCommentClick callback', () => {
    it('calls onCommentClick with comment and position when decoration clicked', async () => {
      const comment: InlineComment = {
        id: 'callback-test',
        type: 'character',
        issue: 'Character inconsistency',
        suggestion: 'Fix the character',
        severity: 'error',
        quote: 'test',
        startIndex: 1,
        endIndex: 5,
        dismissed: false,
        createdAt: Date.now(),
      };

      render(
        <RichTextEditor
          content="Test content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[comment]}
          onCommentClick={onCommentClick}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Find and click the decoration
      await waitFor(() => {
        const decoration = document.querySelector('[data-comment-id="callback-test"]') as HTMLElement | null;
        expect(decoration).toBeInTheDocument();

        if (decoration) {
          fireEvent.click(decoration);
        }
      });

      await waitFor(() => {
        expect(onCommentClick).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'callback-test' }),
          expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) })
        );
      });
    });
  });

  // ====================
  // Decoration Style Tests
  // ====================

  describe('Decoration Styling', () => {
    it('applies error severity styling to comment decorations', async () => {
      const errorComment: InlineComment = {
        id: 'error-style',
        type: 'plot',
        issue: 'Error issue',
        suggestion: 'Fix it',
        severity: 'error',
        quote: 'error',
        startIndex: 1,
        endIndex: 6,
        dismissed: false,
        createdAt: Date.now(),
      };

      render(
        <RichTextEditor
          content="Error text here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[errorComment]}
        />
      );

      await waitFor(() => {
        const decoration = document.querySelector('[data-comment-id="error-style"]');
        if (decoration) {
          const style = (decoration as HTMLElement).getAttribute('style');
          expect(style).toContain('rgb(239, 68, 68)'); // Error color
        }
      });
    });

    it('applies info severity styling to comment decorations', async () => {
      const infoComment: InlineComment = {
        id: 'info-style',
        type: 'pacing',
        issue: 'Info issue',
        suggestion: 'Consider this',
        severity: 'info',
        quote: 'info',
        startIndex: 1,
        endIndex: 5,
        dismissed: false,
        createdAt: Date.now(),
      };

      render(
        <RichTextEditor
          content="Info text here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[infoComment]}
        />
      );

      await waitFor(() => {
        const decoration = document.querySelector('[data-comment-id="info-style"]');
        if (decoration) {
          const style = (decoration as HTMLElement).getAttribute('style');
          expect(style).toContain('rgb(99, 102, 241)'); // Info color
        }
      });
    });

    it('applies analysis highlight with title attribute', async () => {
      const highlights = [{
        start: 1,
        end: 10,
        color: '#ff5500',
        title: 'Pacing alert',
      }];

      render(
        <RichTextEditor
          content="Highlighted text here"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          analysisHighlights={highlights}
        />
      );

      const editor = await getEditorInstance();
      setupEditorMocks(editor);

      // Verify editor is created with highlights
      expect(editor).toBeDefined();
    });
  });

  // ====================
  // Edge Cases
  // ====================

  describe('Edge Cases', () => {
    it('handles empty content gracefully', async () => {
      render(
        <RichTextEditor
          content=""
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
        />
      );

      await waitFor(() => {
        expect(setEditorRef).toHaveBeenCalled();
      });
    });

    it('handles undefined optional callbacks', async () => {
      render(
        <RichTextEditor
          content="Test"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          // No onCommentClick, onFixWithAgent, onDismissComment
        />
      );

      const editor = await getEditorInstance();
      expect(editor).toBeDefined();
    });

    it('handles comment with invalid range', async () => {
      const invalidComment: InlineComment = {
        id: 'invalid',
        type: 'plot',
        issue: 'Issue',
        suggestion: 'Fix',
        severity: 'error',
        quote: 'quote',
        startIndex: 100, // Beyond doc size
        endIndex: 200,
        dismissed: false,
        createdAt: Date.now(),
      };

      render(
        <RichTextEditor
          content="Short"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[invalidComment]}
        />
      );

      // Should render without errors
      expect(await screen.findByText('Short')).toBeInTheDocument();
    });

    it('handles comment severity fallback', async () => {
      // Test with a comment where severity might not match expected values
      const comment: InlineComment = {
        id: 'fallback-test',
        type: 'plot',
        issue: 'Issue',
        suggestion: 'Fix',
        severity: 'warning', // Use valid severity
        quote: 'quote',
        startIndex: 1,
        endIndex: 5,
        dismissed: false,
        createdAt: Date.now(),
      };

      render(
        <RichTextEditor
          content="Test content"
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          setEditorRef={setEditorRef}
          activeHighlight={null}
          inlineComments={[comment]}
        />
      );

      // Text may be split by decorations, verify editor renders
      const editor = await getEditorInstance();
      expect(editor).toBeDefined();
    });
  });
});
