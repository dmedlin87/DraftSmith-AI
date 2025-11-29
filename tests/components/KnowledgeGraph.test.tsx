import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KnowledgeGraph } from '@/features/lore/components/KnowledgeGraph';
import { useProjectStore } from '@/features/project';
import type { CharacterProfile } from '@/types';
import { vi, MockedFunction } from 'vitest';

vi.mock('@/features/project', () => ({
  useProjectStore: vi.fn(),
}));

const mockedUseProjectStore = useProjectStore as MockedFunction<typeof useProjectStore>;

const createMockContext = () => {
  return {
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
  } as unknown as CanvasRenderingContext2D;
};

describe('KnowledgeGraph', () => {
  let mockContext: CanvasRenderingContext2D;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext);
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

  it('shows an empty state when no characters exist', () => {
    mockedUseProjectStore.mockReturnValue({
      currentProject: { lore: { characters: [], worldRules: [] } },
      chapters: [],
    } as any);

    render(<KnowledgeGraph onSelectCharacter={vi.fn()} />);

    expect(screen.getByText(/no characters found/i)).toBeInTheDocument();
  });

  it('renders the graph canvas when characters are present', async () => {
    const characters: CharacterProfile[] = [
      {
        name: 'Alice',
        bio: '',
        arc: '',
        arcStages: [],
        relationships: [{ name: 'Bob', type: 'friend', dynamic: '' }],
        plotThreads: [],
        inconsistencies: [],
        developmentSuggestion: '',
      },
      {
        name: 'Bob',
        bio: '',
        arc: '',
        arcStages: [],
        relationships: [{ name: 'Alice', type: 'ally', dynamic: '' }],
        plotThreads: [],
        inconsistencies: [],
        developmentSuggestion: '',
      },
    ];

    mockedUseProjectStore.mockReturnValue({
      currentProject: { lore: { characters, worldRules: [] } },
      chapters: [],
    } as any);

    render(<KnowledgeGraph onSelectCharacter={vi.fn()} />);

    await waitFor(() => expect(mockContext.fillRect).toHaveBeenCalled());
    expect(screen.queryByText(/no characters found/i)).not.toBeInTheDocument();
  });

  it('allows selecting a character node via canvas click', async () => {
    const onSelectCharacter = vi.fn();
    const characters: CharacterProfile[] = [
      {
        name: 'Alice',
        bio: '',
        arc: '',
        arcStages: [],
        relationships: [],
        plotThreads: [],
        inconsistencies: [],
        developmentSuggestion: '',
      },
    ];

    mockedUseProjectStore.mockReturnValue({
      currentProject: { lore: { characters, worldRules: [] } },
      chapters: [],
    } as any);

    render(<KnowledgeGraph onSelectCharacter={onSelectCharacter} />);

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();

    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 250, clientY: 200 });

    await waitFor(() => expect(onSelectCharacter).toHaveBeenCalled());
    expect(onSelectCharacter).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }));
  });
});
