import React from 'react';
import { motion } from 'framer-motion';
import { AnalysisResult, AnalysisWarning } from '@/types';
import { findQuoteRange } from '@/features/shared';
import { ScoreCard } from './ScoreCard';
import { IssueCard } from './IssueCard';
import { Contradiction, Lore } from '@/types/schema';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isLoading: boolean;
  currentText: string;
  onNavigate: (start: number, end: number) => void;
  onFixRequest?: (issueContext: string, suggestion: string) => void;
  warning?: AnalysisWarning | null;
  onAnalyzeSelection?: () => void;
  hasSelection?: boolean;
  contradictions?: Contradiction[];
  derivedLore?: Lore | null;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, isLoading, currentText, onNavigate, onFixRequest, warning, onAnalyzeSelection, hasSelection, contradictions = [], derivedLore }) => {
  
  const handleQuoteClick = (quote?: string) => {
    if (!quote) return;
    const range = findQuoteRange(currentText, quote);
    if (range) onNavigate(range.start, range.end);
  };

  const handleFixClick = (e: React.MouseEvent, issue: { issue: string; suggestion: string; quote?: string; location?: string }) => {
    e.stopPropagation();
    if (onFixRequest) {
      const context = issue.quote 
        ? `"${issue.quote}"${issue.location ? ` (${issue.location})` : ''}` 
        : issue.location || 'Unknown location';
      onFixRequest(context, issue.suggestion);
    }
  };

  if (isLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full p-8 text-center gap-4"
      >
         <motion.div 
           className="w-8 h-8 border-2 border-[var(--interactive-accent)] border-t-transparent rounded-full"
           animate={{ rotate: 360 }}
           transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
         />
         <motion.p 
           className="font-serif text-[var(--text-secondary)]"
           animate={{ opacity: [0.5, 1, 0.5] }}
           transition={{ duration: 2, repeat: Infinity }}
         >
           Consulting the muse...
         </motion.p>
      </motion.div>
    );
  }

  if (!analysis) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full p-8 text-center"
      >
        <p className="text-[var(--text-tertiary)] font-serif italic">Run an analysis to reveal insights.</p>
      </motion.div>
    );
  }

  // Combine all issues into a single list
  const allIssues = [
    ...analysis.plotIssues.map(issue => ({ ...issue, type: 'plot' as const })),
    ...(analysis.settingAnalysis?.issues || []).map(issue => ({ ...issue, type: 'setting' as const })),
  ];

  const handleContradictionNavigate = (position: number) => {
    const end = position + 50;
    onNavigate(position, end);
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6 animate-fade-in">
      {/* Warning Banner */}
      {warning && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--warning-300)] bg-[var(--warning-50)] text-[var(--warning-800)] animate-slide-up">
          <div className="mt-0.5 text-[var(--warning-600)] font-bold">!</div>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[var(--text-sm)] font-semibold text-[var(--warning-800)]">Analysis Warning</p>
                <p className="text-[var(--text-xs)] leading-relaxed">{warning.message}</p>
                {warning.removedChars !== undefined && warning.removedPercent !== undefined && (
                  <p className="text-[var(--text-xs)] text-[var(--warning-700)]">
                    Removed {warning.removedChars.toLocaleString()} characters ({warning.removedPercent}% of the input).
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {onAnalyzeSelection && (
                <button
                  type="button"
                  onClick={onAnalyzeSelection}
                  disabled={!hasSelection}
                  className={`px-3 py-1 rounded-md text-[var(--text-xs)] font-semibold transition-colors ${
                    hasSelection
                      ? 'bg-[var(--warning-600)] text-white hover:bg-[var(--warning-700)]'
                      : 'bg-[var(--warning-100)] text-[var(--warning-600)] cursor-not-allowed'
                  }`}
                >
                  Analyze selection only
                </button>
              )}
              <a
                className="px-3 py-1 rounded-md text-[var(--text-xs)] font-semibold bg-[var(--warning-100)] text-[var(--warning-700)] hover:bg-[var(--warning-200)]"
                href="/token-limits.html"
                target="_blank"
                rel="noreferrer"
              >
                Token limit guidance
              </a>
            </div>
          </div>
        </div>
      )}
      
      {/* Score Card - Now a dumb component */}
      <ScoreCard label="Pacing Score" score={analysis.pacing.score} />

      {/* Executive Summary */}
      <section className="animate-fade-in">
        <h4 className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-3">
          Executive Summary
        </h4>
        <p className="text-[var(--text-sm)] text-[var(--text-secondary)] leading-relaxed font-serif">
          {analysis.summary}
        </p>
      </section>

      {/* Issues List - CSS transitions, no AnimatePresence */}
      <section>
        <h4 className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-3">
          Detected Issues
        </h4>
        {allIssues.length === 0 ? (
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] italic">
            No issues detected. Great work!
          </p>
        ) : (
          <div className="space-y-3 stagger-list">
            {allIssues.map((issue, i) => (
              <div key={`${issue.type}-${i}`} className="list-item-enter">
                <IssueCard
                  title={issue.issue}
                  suggestion={issue.suggestion}
                  severity={issue.type === 'plot' ? 'error' : 'warning'}
                  onClick={() => handleQuoteClick(issue.quote)}
                  onFixClick={onFixRequest ? (e) => handleFixClick(e, issue) : undefined}
                  showFixButton={!!onFixRequest}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-3">
          Intelligence HUD
        </h4>
        {contradictions.length === 0 && !derivedLore ? (
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] italic">
            Run the intelligence pass to surface contradictions and derived lore.
          </p>
        ) : (
          <div className="space-y-4">
            {contradictions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[var(--text-xs)] text-[var(--text-secondary)] uppercase tracking-wide font-semibold">Contradictions</p>
                {contradictions.map((contradiction, idx) => (
                  <div
                    key={`${contradiction.type}-${contradiction.position}-${idx}`}
                    className="p-3 rounded-lg border border-[var(--ink-100)] bg-[var(--parchment-50)] shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">
                          {contradiction.type.replace('_', ' ')}
                        </p>
                        <p className="text-[var(--text-xs)] text-[var(--text-secondary)]">
                          {contradiction.characterName ? `${contradiction.characterName} • ` : ''}{contradiction.attribute || 'detail'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleContradictionNavigate(contradiction.position)}
                        className="text-[var(--text-xs)] px-3 py-1 rounded-full bg-[var(--magic-100)] text-[var(--magic-700)] hover:bg-[var(--magic-200)]"
                      >
                        Jump to text
                      </button>
                    </div>
                    <p className="text-[var(--text-xs)] text-[var(--text-secondary)] mt-2">
                      {contradiction.originalValue} → {contradiction.newValue}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {derivedLore && (
              <div className="space-y-3">
                <p className="text-[var(--text-xs)] text-[var(--text-secondary)] uppercase tracking-wide font-semibold">Derived Lore</p>
                {derivedLore.worldRules?.length > 0 && (
                  <div>
                    <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mb-1">World Rules</p>
                    <div className="flex flex-wrap gap-2">
                      {derivedLore.worldRules.map((rule, idx) => (
                        <span
                          key={`${rule}-${idx}`}
                          className="px-2 py-1 rounded-full bg-[var(--ink-900)] text-[var(--parchment-50)] text-[var(--text-xs)]"
                        >
                          {rule}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {derivedLore.characters?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[var(--text-xs)] text-[var(--text-tertiary)]">Characters</p>
                    <div className="space-y-2">
                      {derivedLore.characters.map((character) => (
                        <div
                          key={character.name}
                          className="p-2 rounded-lg border border-[var(--ink-100)] bg-white"
                        >
                          <p className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">{character.name}</p>
                          <p className="text-[var(--text-xs)] text-[var(--text-secondary)] line-clamp-2">{character.bio}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
