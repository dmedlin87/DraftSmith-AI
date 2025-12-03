import React from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

interface NativeSpellcheckToggleProps {
  className?: string;
}

export const NativeSpellcheckToggle: React.FC<NativeSpellcheckToggleProps> = ({ className = '' }) => {
  const { nativeSpellcheckEnabled, setNativeSpellcheckEnabled } = useSettingsStore();

  return (
    <button
      type="button"
      aria-pressed={nativeSpellcheckEnabled}
      onClick={() => setNativeSpellcheckEnabled(!nativeSpellcheckEnabled)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[var(--text-sm)] transition-colors shadow-sm ${
        nativeSpellcheckEnabled
          ? 'bg-[var(--interactive-bg-active)] border-[var(--interactive-accent)] text-[var(--interactive-accent)]'
          : 'bg-[var(--surface-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--interactive-accent)]'
      } ${className}`}
      title="Toggle browser spellcheck, autocorrect, and autocomplete"
    >
      <span className="text-base" aria-hidden="true">
        {nativeSpellcheckEnabled ? '✅' : '🚫'}
      </span>
      <span className="font-medium">Native Spellcheck</span>
    </button>
  );
};

