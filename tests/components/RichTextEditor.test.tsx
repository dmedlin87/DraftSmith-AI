import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

import { RichTextEditor } from '@/features/editor/components/RichTextEditor';
import { InlineComment } from '@/types/schema';

describe('RichTextEditor', () => {
  const setEditorRef = vi.fn();
  const onUpdate = vi.fn();
  const onSelectionChange = vi.fn();

  beforeEach(() => {
    setEditorRef.mockReset();
    onUpdate.mockReset();
    onSelectionChange.mockReset();
  });

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

  it('notifies updates and selection changes through callbacks', async () => {
    const inlineComments: InlineComment[] = [];

    render(
      <RichTextEditor
        content="Start"
        onUpdate={onUpdate}
        onSelectionChange={onSelectionChange}
        setEditorRef={setEditorRef}
        activeHighlight={null}
        inlineComments={inlineComments}
      />
    );

    const editorInstance = await waitFor(() => {
      const editor = setEditorRef.mock.calls.find(([instance]) => Boolean(instance))?.[0];
      if (!editor) {
        throw new Error('editor not ready');
      }
      return editor;
    });

    editorInstance.state.reconfigure = () => editorInstance.state;
    editorInstance.view.updateState = () => {};
    editorInstance.view.coordsAtPos = () => ({ top: 0, left: 0, bottom: 0, right: 0 });

    act(() => {
      editorInstance.commands.setContent('Updated content');
      editorInstance.options.onUpdate?.({ editor: editorInstance } as any);

      const selectionEditor = {
        ...editorInstance,
        state: {
          selection: { from: 1, to: 3, empty: false },
          doc: { textBetween: () => 'Up' },
        },
        view: { coordsAtPos: () => ({ top: 0, left: 0, bottom: 0, right: 0 }) },
      } as any;

      editorInstance.options.onSelectionUpdate?.({ editor: selectionEditor } as any);
    });

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    await waitFor(() => expect(onSelectionChange).toHaveBeenCalled());
  });
});
