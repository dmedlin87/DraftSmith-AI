import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { KnowledgeGraph } from '@/features/lore/components/KnowledgeGraph';
import { useProjectStore } from '@/features/project';
import type { CharacterProfile } from '@/types';

vi.mock('@/features/project', () => ({
  useProjectStore: vi.fn(),
}));

const mockedUseProjectStore = vi.mocked(useProjectStore);

const createMockContext = () => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 20 })),
  roundRect: vi.fn(),
  set fillStyle(value: string) {},
  set strokeStyle(value: string) {},
  set lineWidth(value: number) {},
  set font(value: string) {},
  set textAlign(value: CanvasTextAlign) {},
  set textBaseline(value: CanvasTextBaseline) {},
  set shadowBlur(value: number) {},
  set shadowColor(value: string) {},
}) as unknown as CanvasRenderingContext2D;

describe('KnowledgeGraph feature flow', () => {
  let mockContext: CanvasRenderingContext2D;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as any;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 500,
      height: 400,
      top: 0,
      left: 0,
      right: 500,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    }));

    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as any);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  it('navigates character graph nodes via hover and click interactions', async () => {
    const onSelect = vi.fn();
    const loreCharacters: CharacterProfile[] = [
      {
        name: 'Alice',
        bio: '',
        arc: '',
        arcStages: [],
        relationships: [{ name: 'Bob', type: 'friend', dynamic: 'ally' }],
        plotThreads: [],
        inconsistencies: [],
        developmentSuggestion: '',
      },
    ];
    const chapterCharacters: CharacterProfile[] = [
      {
        name: 'Bob',
        bio: '',
        arc: '',
        arcStages: [],
        relationships: [{ name: 'Alice', type: 'friend', dynamic: 'ally' }],
        plotThreads: [],
        inconsistencies: [],
        developmentSuggestion: '',
      },
    ];

    mockedUseProjectStore.mockReturnValue({
      currentProject: { lore: { characters: loreCharacters, worldRules: [] } },
      chapters: [
        {
          id: 'c1',
          title: 'Chapter',
          content: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectId: 'p1',
          lastAnalysis: { characters: chapterCharacters },
        },
      ],
    } as any);

    render(<KnowledgeGraph onSelectCharacter={onSelect} />);

    await waitFor(() => expect(mockContext.fillRect).toHaveBeenCalled());

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);

    fireEvent.mouseMove(canvas as HTMLCanvasElement, { clientX: 250, clientY: 200 });
    expect((canvas as HTMLCanvasElement).style.cursor).toBe('pointer');

    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 250, clientY: 200 });
    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }));

    fireEvent.mouseMove(canvas as HTMLCanvasElement, { clientX: 10, clientY: 10 });
    expect((canvas as HTMLCanvasElement).style.cursor).toBe('default');
  });

  it('shows an informative empty state when no characters can be drawn', () => {
    mockedUseProjectStore.mockReturnValue({
      currentProject: { lore: { characters: [], worldRules: [] } },
      chapters: [],
    } as any);

    render(<KnowledgeGraph onSelectCharacter={vi.fn()} />);

    expect(screen.getByText(/no characters found/i)).toBeInTheDocument();
  });
});
