import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CritiqueIntensity, DEFAULT_CRITIQUE_INTENSITY } from '@/types/critiqueSettings';
import {
  ExperienceLevel,
  AutonomyMode,
  DEFAULT_EXPERIENCE,
  DEFAULT_AUTONOMY,
} from '@/types/experienceSettings';

interface SettingsState {
  // Critique intensity
  critiqueIntensity: CritiqueIntensity;
  setCritiqueIntensity: (intensity: CritiqueIntensity) => void;

  // Experience level
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (level: ExperienceLevel) => void;

  // Autonomy mode
  autonomyMode: AutonomyMode;
  setAutonomyMode: (mode: AutonomyMode) => void;

  // Budget Settings
  budgetThreshold: number;
  setBudgetThreshold: (threshold: number) => void;

  // Editor preferences
  nativeSpellcheckEnabled: boolean;
  setNativeSpellcheckEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      critiqueIntensity: DEFAULT_CRITIQUE_INTENSITY,
      experienceLevel: DEFAULT_EXPERIENCE,
      autonomyMode: DEFAULT_AUTONOMY,
      budgetThreshold: 1.0,
      nativeSpellcheckEnabled: true,

      setCritiqueIntensity: (intensity) => {
        set({ critiqueIntensity: intensity });
      },

      setExperienceLevel: (level) => {
        set({ experienceLevel: level });
      },

      setAutonomyMode: (mode) => {
        set({ autonomyMode: mode });
      },

      setBudgetThreshold: (threshold) => {
        set({ budgetThreshold: threshold });
      },

      setNativeSpellcheckEnabled: (enabled) => {
        set({ nativeSpellcheckEnabled: enabled });
      },
    }),
    {
      name: 'quill-settings',
    }
  )
);
