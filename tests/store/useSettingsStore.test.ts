import { describe, it, expect, beforeEach } from 'vitest';

import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { DEFAULT_CRITIQUE_INTENSITY, CritiqueIntensity } from '@/types/critiqueSettings';
import {
  DEFAULT_EXPERIENCE,
  DEFAULT_AUTONOMY,
  ExperienceLevel,
  AutonomyMode,
} from '@/types/experienceSettings';

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset to defaults before each test to avoid persistence bleed-through
    useSettingsStore.setState({
      critiqueIntensity: DEFAULT_CRITIQUE_INTENSITY,
      experienceLevel: DEFAULT_EXPERIENCE,
      autonomyMode: DEFAULT_AUTONOMY,
      nativeSpellcheckEnabled: true,
    });
  });

  it('initializes with default settings', () => {
    const state = useSettingsStore.getState();

    expect(state.critiqueIntensity).toBe(DEFAULT_CRITIQUE_INTENSITY);
    expect(state.experienceLevel).toBe(DEFAULT_EXPERIENCE);
    expect(state.autonomyMode).toBe(DEFAULT_AUTONOMY);
    expect(state.nativeSpellcheckEnabled).toBe(true);
  });

  it('updates critiqueIntensity via setCritiqueIntensity', () => {
    const { setCritiqueIntensity } = useSettingsStore.getState();

    setCritiqueIntensity('intensive' as CritiqueIntensity);

    expect(useSettingsStore.getState().critiqueIntensity).toBe('intensive');
  });

  it('updates experienceLevel via setExperienceLevel', () => {
    const { setExperienceLevel } = useSettingsStore.getState();

    setExperienceLevel('pro' as ExperienceLevel);

    expect(useSettingsStore.getState().experienceLevel).toBe('pro');
  });

  it('updates autonomyMode via setAutonomyMode', () => {
    const { setAutonomyMode } = useSettingsStore.getState();

    setAutonomyMode('auto' as AutonomyMode);

    expect(useSettingsStore.getState().autonomyMode).toBe('auto');
  });

  it('toggles native spellcheck preference', () => {
    const { setNativeSpellcheckEnabled } = useSettingsStore.getState();

    setNativeSpellcheckEnabled(false);

    expect(useSettingsStore.getState().nativeSpellcheckEnabled).toBe(false);
  });
});
