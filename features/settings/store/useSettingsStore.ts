import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CritiqueIntensity, DEFAULT_CRITIQUE_INTENSITY } from '@/types/critiqueSettings';

interface SettingsState {
  // Critique intensity
  critiqueIntensity: CritiqueIntensity;
  setCritiqueIntensity: (intensity: CritiqueIntensity) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      critiqueIntensity: DEFAULT_CRITIQUE_INTENSITY,
      
      setCritiqueIntensity: (intensity) => {
        set({ critiqueIntensity: intensity });
      },
    }),
    {
      name: 'quill-settings',
    }
  )
);
