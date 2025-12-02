import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BudgetSelector } from '@/features/settings/components/BudgetSelector';
import { ExperienceSelector } from '@/features/settings/components/ExperienceSelector';
import { CritiqueIntensitySelector } from '@/features/settings/components/CritiqueIntensitySelector';

if (typeof PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    constructor(type: string, params?: MouseEventInit) {
      super(type, params);
    }
  }
  // @ts-expect-error jsdom global
  global.PointerEvent = MockPointerEvent;
}

const mockStore = {
  budgetThreshold: 1,
  experienceLevel: 'intermediate',
  autonomyMode: 'copilot',
  critiqueIntensity: 'standard',
  setBudgetThreshold: vi.fn(),
  setExperienceLevel: vi.fn(),
  setAutonomyMode: vi.fn(),
  setCritiqueIntensity: vi.fn(),
};

vi.mock('@/features/settings/store/useSettingsStore', () => ({
  useSettingsStore: () => mockStore,
}));

describe('Settings selectors', () => {
  beforeEach(() => {
    Object.assign(mockStore, {
      budgetThreshold: 1,
      experienceLevel: 'intermediate',
      autonomyMode: 'copilot',
      critiqueIntensity: 'standard',
    });
    mockStore.setBudgetThreshold.mockClear();
    mockStore.setExperienceLevel.mockClear();
    mockStore.setAutonomyMode.mockClear();
    mockStore.setCritiqueIntensity.mockClear();
  });

  it('updates budget threshold when preset clicked', () => {
    render(<BudgetSelector />);

    fireEvent.click(screen.getByText('$0.50'));

    expect(mockStore.setBudgetThreshold).toHaveBeenCalledWith(0.5);
  });

  it('highlights active budget selection', () => {
    render(<BudgetSelector />);

    const active = screen.getByText('$1.00');
    expect(active.className).toContain('magic');
  });

  it('changes experience level', () => {
    render(<ExperienceSelector />);

    fireEvent.click(screen.getByText('Novice'));

    expect(mockStore.setExperienceLevel).toHaveBeenCalledWith('novice');
  });

  it('respects showLabels flag and allows keyboard selection for experience', async () => {
    const user = userEvent.setup();

    render(<ExperienceSelector showLabels={false} />);

    expect(screen.queryByText('Experience Level')).toBeNull();

    const proButton = screen.getByRole('button', { name: '🎯 Pro' });
    proButton.focus();
    await user.keyboard('{Enter}');

    expect(mockStore.setExperienceLevel).toHaveBeenCalledWith('pro');
  });

  it('changes critique intensity', () => {
    render(<CritiqueIntensitySelector />);

    fireEvent.click(screen.getByText('Developmental'));

    expect(mockStore.setCritiqueIntensity).toHaveBeenCalledWith('developmental');
  });

  it('handles compact critique selector and keyboard interactions', async () => {
    const user = userEvent.setup();

    render(<CritiqueIntensitySelector compact />);

    const standardButton = screen.getByRole('button', { name: '⚖️' });
    standardButton.focus();
    await user.keyboard('{Enter}');

    expect(mockStore.setCritiqueIntensity).toHaveBeenCalledWith('standard');
  });

  it('updates autonomy and budget selection state when props change', () => {
    const { rerender } = render(<ExperienceSelector compact />);

    const autonomyButtons = screen.getAllByRole('button');
    fireEvent.click(autonomyButtons[autonomyButtons.length - 1]);
    expect(mockStore.setAutonomyMode).toHaveBeenCalledWith('auto');

    rerender(<BudgetSelector />);
    mockStore.budgetThreshold = 5;

    const preset = screen.getByText('$5.00');
    expect(preset.className).toContain('magic');
  });
});
