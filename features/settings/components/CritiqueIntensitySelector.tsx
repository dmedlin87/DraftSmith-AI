import React from 'react';
import { motion } from 'framer-motion';
import { CRITIQUE_PRESETS, CritiqueIntensity } from '@/types/critiqueSettings';
import { useSettingsStore } from '../store/useSettingsStore';

interface CritiqueIntensitySelectorProps {
  compact?: boolean;
}

export const CritiqueIntensitySelector: React.FC<CritiqueIntensitySelectorProps> = ({ 
  compact = false 
}) => {
  const { critiqueIntensity, setCritiqueIntensity } = useSettingsStore();

  if (compact) {
    return (
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
        {Object.values(CRITIQUE_PRESETS).map((preset) => (
          <button
            key={preset.id}
            onClick={() => setCritiqueIntensity(preset.id)}
            className={`
              relative px-2 py-1 rounded text-xs font-medium transition-all
              ${critiqueIntensity === preset.id 
                ? 'text-white' 
                : 'text-slate-400 hover:text-slate-300'
              }
            `}
            title={preset.description}
          >
            {critiqueIntensity === preset.id && (
              <motion.div
                layoutId="intensity-pill"
                className="absolute inset-0 rounded"
                style={{ backgroundColor: preset.color }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{preset.icon}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">
        Critique Intensity
      </label>
      <p className="text-xs text-slate-500 -mt-1">
        Controls how rigorous the AI feedback is
      </p>
      <div className="grid grid-cols-1 gap-2">
        {Object.values(CRITIQUE_PRESETS).map((preset) => {
          const isActive = critiqueIntensity === preset.id;
          return (
            <motion.button
              key={preset.id}
              onClick={() => setCritiqueIntensity(preset.id)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`
                relative p-3 rounded-lg border-2 transition-all text-left
                ${isActive 
                  ? 'border-opacity-100 bg-opacity-10' 
                  : 'border-slate-700 hover:border-slate-600 bg-transparent'
                }
              `}
              style={{
                borderColor: isActive ? preset.color : undefined,
                backgroundColor: isActive ? `${preset.color}15` : undefined,
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{preset.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-200 flex items-center gap-2">
                    {preset.label}
                    {isActive && (
                      <span 
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: preset.color, color: 'white' }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {preset.description}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Small badge showing current intensity - for use in headers
 */
export const IntensityBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { critiqueIntensity } = useSettingsStore();
  const preset = CRITIQUE_PRESETS[critiqueIntensity];

  return (
    <div 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className}`}
      style={{ backgroundColor: `${preset.color}20`, color: preset.color }}
      title={`Critique mode: ${preset.label} - ${preset.description}`}
    >
      <span>{preset.icon}</span>
      <span>{preset.label}</span>
    </div>
  );
};
