import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetSelector } from '@/features/settings/components/BudgetSelector';
import { ExperienceSelector } from '@/features/settings/components/ExperienceSelector';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { DEFAULT_AUTONOMY, DEFAULT_EXPERIENCE } from '@/types/experienceSettings';
import { DEFAULT_CRITIQUE_INTENSITY } from '@/types/critiqueSettings';

describe('Settings selectors', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      budgetThreshold: 1.0,
      experienceLevel: DEFAULT_EXPERIENCE,
      autonomyMode: DEFAULT_AUTONOMY,
      critiqueIntensity: DEFAULT_CRITIQUE_INTENSITY,
    });
  });

  it('updates budget threshold when preset is clicked', () => {
    const setBudgetThreshold = vi.fn();
    useSettingsStore.setState({ setBudgetThreshold });

    render(<BudgetSelector />);

    fireEvent.click(screen.getByRole('button', { name: '$0.50' }));
    expect(setBudgetThreshold).toHaveBeenCalledWith(0.5);
  });

  it('switches experience and autonomy presets in compact mode', () => {
    const setExperienceLevel = vi.fn();
    const setAutonomyMode = vi.fn();
    useSettingsStore.setState({ setExperienceLevel, setAutonomyMode });

    render(<ExperienceSelector compact showLabels={false} />);

    const expButtons = screen.getAllByRole('button');
    fireEvent.click(expButtons[0]);
    expect(setExperienceLevel).toHaveBeenCalled();

    const autonomyButtons = screen.getAllByRole('button');
    fireEvent.click(autonomyButtons[autonomyButtons.length - 1]);
    expect(setAutonomyMode).toHaveBeenCalled();
  });
});
