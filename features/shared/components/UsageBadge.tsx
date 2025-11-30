import React from 'react';
import { useUsage } from '../context/UsageContext';
import { useSettingsStore } from '@/features/settings';
import { AccessibleTooltip } from './AccessibleTooltip';

/**
 * UsageTooltipContent - Separated for cleaner rendering
 */
const UsageTooltipContent: React.FC<{
  promptTokens: number;
  responseTokens: number;
  totalRequestCount: number;
  sessionCost: number;
  totalCost: number;
  budgetThreshold: number;
}> = ({ promptTokens, responseTokens, totalRequestCount, sessionCost, totalCost, budgetThreshold }) => (
  <>
    <div className="flex justify-between mb-1">
      <span>Input:</span>
      <span className="font-mono">{promptTokens.toLocaleString()}</span>
    </div>
    <div className="flex justify-between mb-1">
      <span>Output:</span>
      <span className="font-mono">{responseTokens.toLocaleString()}</span>
    </div>
    <div className="border-t border-[var(--ink-700)] pt-1 mt-1 flex justify-between text-[var(--magic-300)]">
      <span>Requests:</span>
      <span className="font-mono">{totalRequestCount}</span>
    </div>
    <div className="flex justify-between mt-1 text-[var(--magic-200)]">
      <span>Limit: ${budgetThreshold.toFixed(2)}</span>
      <span className="font-mono">${sessionCost.toFixed(4)}</span>
    </div>
    <div className="flex justify-between mt-1 text-[var(--magic-200)]">
      <span>Lifetime:</span>
      <span className="font-mono">${totalCost.toFixed(4)}</span>
    </div>
  </>
);

/**
 * UsageBadge - Displays token usage and cost with accessible tooltip.
 * 
 * Accessibility:
 * - Tooltip shows on hover AND focus (keyboard accessible)
 * - Uses aria-describedby for screen readers
 * - Escape key dismisses tooltip
 * - Boundary detection prevents off-screen overflow
 */
export const UsageBadge: React.FC = () => {
  const { promptTokens, responseTokens, totalRequestCount, totalCost, sessionCost } = useUsage();
  const { budgetThreshold } = useSettingsStore();
  
  if (totalRequestCount === 0) return null;

  const total = promptTokens + responseTokens;
  const budgetExceeded = sessionCost > budgetThreshold;
  const mainCost = sessionCost.toFixed(2);

  return (
    <AccessibleTooltip
      position="bottom"
      showDelay={150}
      content={
        <UsageTooltipContent
          promptTokens={promptTokens}
          responseTokens={responseTokens}
          totalRequestCount={totalRequestCount}
          sessionCost={sessionCost}
          totalCost={totalCost}
          budgetThreshold={budgetThreshold}
        />
      }
    >
      <button
        type="button"
        className={`flex items-center gap-2 px-3 py-1.5 bg-[var(--parchment-50)] border rounded-full shadow-sm text-[10px] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--interactive-accent)] focus:ring-offset-1 ${
          budgetExceeded
            ? 'border-[var(--error-300)] text-[var(--error-600)] hover:border-[var(--error-400)]'
            : 'border-[var(--ink-100)] text-[var(--ink-400)] hover:border-[var(--magic-300)]'
        }`}
        aria-label={`Token usage: ${total.toLocaleString()} tokens, cost: $${mainCost}${budgetExceeded ? ', budget exceeded' : ''}`}
      >
        <div className="flex items-center gap-1">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 20 20" 
            fill="currentColor" 
            className="w-3 h-3 text-[var(--magic-500)]"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <span className="font-mono font-medium">{total.toLocaleString()} tokens</span>
          <span className="font-mono text-[var(--ink-500)]">
            · ${mainCost}
          </span>
          {budgetExceeded && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[var(--error-500)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--error-500)]" aria-hidden="true" />
              <span>high</span>
            </span>
          )}
        </div>
      </button>
    </AccessibleTooltip>
  );
};
