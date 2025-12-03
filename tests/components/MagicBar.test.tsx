import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MagicBar } from '@/features/editor/components/MagicBar';

const mockViewportCollision = vi.fn(() => ({ top: 50, left: 50, adjusted: false, adjustments: {} }));

vi.mock('@/features/shared', () => ({
  useViewportCollision: () => mockViewportCollision(),
}));

describe('MagicBar', () => {
  beforeAll(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  beforeEach(() => {
    mockViewportCollision.mockClear();
  });

  const baseProps = {
    position: { top: 100, left: 100 },
    onRewrite: vi.fn(),
    onHelp: vi.fn(),
    onApply: vi.fn(),
    onClose: vi.fn(),
    activeMode: null as string | null,
    grammarSuggestions: [],
    onGrammarCheck: vi.fn(),
    onApplyGrammar: vi.fn(),
    onApplyAllGrammar: vi.fn(),
    onDismissGrammar: vi.fn(),
  };

  it('shows loading state with active mode', () => {
    render(
      <MagicBar
        {...baseProps}
        isLoading
        variations={[]}
        helpResult={undefined}
        helpType={null}
        activeMode="Dialogue Doctor"
        grammarSuggestions={[]}
      />
    );

    expect(screen.getByText('Consulting the muse...')).toBeInTheDocument();
    expect(screen.getByText('Dialogue Doctor')).toBeInTheDocument();
  });

  it('renders menu actions and toggles tone view', () => {
    const onRewrite = vi.fn();
    const onHelp = vi.fn();

    render(
      <MagicBar
        {...baseProps}
        isLoading={false}
        variations={[]}
        helpResult={undefined}
        helpType={null}
        onRewrite={onRewrite}
        onHelp={onHelp}
        grammarSuggestions={[]}
      />
    );

    fireEvent.click(screen.getByText('Show'));
    expect(onRewrite).toHaveBeenCalledWith("Show, Don't Tell");

    fireEvent.click(screen.getByText('Explain'));
    expect(onHelp).toHaveBeenCalledWith('Explain');

    fireEvent.click(screen.getByText('Tone'));
    fireEvent.click(screen.getByText('Darker'));
    expect(onRewrite).toHaveBeenCalledWith('Tone Tuner', 'Darker');
  });

  it('renders variations view and applies selections', () => {
    const onApply = vi.fn();

    render(
      <MagicBar
        {...baseProps}
        isLoading={false}
        variations={[
          'A brisk alternative line.',
          'Another possible rewrite.',
        ]}
        helpResult={undefined}
        helpType={null}
        onApply={onApply}
        grammarSuggestions={[]}
      />
    );

    fireEvent.click(screen.getByText('A brisk alternative line.'));
    expect(onApply).toHaveBeenCalledWith('A brisk alternative line.');

    const copyButtons = screen.getAllByTitle('Copy to clipboard');
    fireEvent.click(copyButtons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('A brisk alternative line.');
  });

  it('shows help suggestions for thesaurus results', () => {
    const onApply = vi.fn();

    render(
      <MagicBar
        {...baseProps}
        isLoading={false}
        variations={[]}
        helpResult={'brave, bold'}
        helpType={'Thesaurus'}
        onApply={onApply}
        grammarSuggestions={[]}
      />
    );

    fireEvent.click(screen.getByText('brave'));
    expect(onApply).toHaveBeenCalledWith('brave');
  });

  it('renders grammar suggestions and wires apply/dismiss', () => {
    const onApplyGrammar = vi.fn();
    const onDismissGrammar = vi.fn();

    render(
      <MagicBar
        {...baseProps}
        isLoading={false}
        variations={[]}
        grammarSuggestions={[
          {
            id: 'g1',
            start: 0,
            end: 4,
            replacement: 'fixed',
            message: 'Fix spelling',
            severity: 'grammar',
            originalText: 'teh',
          },
        ]}
        helpResult={undefined}
        helpType={null}
        onApplyGrammar={onApplyGrammar}
        onDismissGrammar={onDismissGrammar}
      />
    );

    fireEvent.click(screen.getByText('Apply fix'));
    expect(onApplyGrammar).toHaveBeenCalledWith('g1');

    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismissGrammar).toHaveBeenCalledWith('g1');
  });
});
