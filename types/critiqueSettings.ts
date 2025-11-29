/**
 * Critique Intensity Settings
 * Controls how rigorous/picky the AI feedback is
 */

export type CritiqueIntensity = 'developmental' | 'standard' | 'intensive';

export interface CritiquePreset {
  id: CritiqueIntensity;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const CRITIQUE_PRESETS: Record<CritiqueIntensity, CritiquePreset> = {
  developmental: {
    id: 'developmental',
    label: 'Developmental',
    description: 'Focus on story-level issues: plot, characters, and major pacing problems.',
    icon: '🌱',
    color: '#10b981', // green
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced critique covering structure, prose, and consistency.',
    icon: '⚖️',
    color: '#6366f1', // indigo
  },
  intensive: {
    id: 'intensive',
    label: 'Intensive',
    description: 'Publication-ready bar. Line-level prose, deep analysis, industry standards.',
    icon: '🔬',
    color: '#ef4444', // red
  },
};

export const DEFAULT_CRITIQUE_INTENSITY: CritiqueIntensity = 'standard';
