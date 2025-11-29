import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoreManager } from '@/features/lore';
import { useProjectStore } from '@/features/project';
import type { CharacterProfile } from '@/types';
import { vi, MockedFunction } from 'vitest';

vi.mock('@/features/project', () => ({
  useProjectStore: vi.fn(),
}));

const mockedUseProjectStore = useProjectStore as MockedFunction<typeof useProjectStore>;
const updateProjectLore = vi.fn();

const baseCharacter: CharacterProfile = {
  name: 'Alice',
  bio: 'Explorer',
  arc: 'Growth',
  arcStages: [],
  relationships: [],
  plotThreads: [],
  inconsistencies: [],
  developmentSuggestion: '',
};

const renderWithProject = (characters: CharacterProfile[]) => {
  mockedUseProjectStore.mockReturnValue({
    currentProject: {
      id: 'project-1',
      lore: { characters, worldRules: [] },
    },
    updateProjectLore,
  } as any);

  return render(<LoreManager />);
};

const findInputByLabel = (labelText: string, selector = 'input') => {
  const label = screen.getByText(labelText);
  const container = label.parentElement || label.closest('div');
  return container?.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
};

describe('LoreManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new character through the form', () => {
    renderWithProject([]);

    fireEvent.click(screen.getByRole('button', { name: /add your first character/i }));

    const nameInput = findInputByLabel('Name');
    fireEvent.change(nameInput, { target: { value: 'New Hero' } });

    fireEvent.click(screen.getByRole('button', { name: /save character/i }));

    expect(updateProjectLore).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        characters: [expect.objectContaining({ name: 'New Hero' })],
        worldRules: [],
      })
    );
  });

  it('edits an existing character and saves changes', () => {
    renderWithProject([baseCharacter]);

    fireEvent.click(screen.getByText('Alice'));

    const bioInput = findInputByLabel('Biography', 'textarea');
    fireEvent.change(bioInput, { target: { value: 'Updated biography' } });

    fireEvent.click(screen.getByRole('button', { name: /save character/i }));

    expect(updateProjectLore).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        characters: [expect.objectContaining({ bio: 'Updated biography' })],
      })
    );
  });

  it('deletes a character from the list', () => {
    renderWithProject([baseCharacter]);

    fireEvent.click(screen.getByText('Alice'));
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(updateProjectLore).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ characters: [] })
    );
  });
});
