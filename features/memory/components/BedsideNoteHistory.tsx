import React, { useMemo } from 'react';
import type { Change } from 'diff';
import { ChainedMemory } from '@/services/memory/chains';

interface BedsideNoteHistoryProps {
  history: ChainedMemory[];
  pinnedId: string | null;
  onPin: (memoryId: string | null) => void;
  renderDiff: (currentText: string, previousText: string) => Change[];
}

const DiffView: React.FC<{ changes: Change[] }> = ({ changes }) => {
  return (
    <div className="text-xs bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded p-2 space-y-1">
      {changes.map((change, idx) => {
        const className = change.added
          ? 'text-[var(--success-600)]'
          : change.removed
            ? 'text-[var(--error-600)]'
            : 'text-[var(--text-secondary)]';
        const prefix = change.added ? '+ ' : change.removed ? '- ' : '  ';
        return (
          <div key={`${idx}-${prefix}`} className="whitespace-pre-wrap">
            <span className={className}>{`${prefix}${change.value}`}</span>
          </div>
        );
      })}
    </div>
  );
};

export const BedsideNoteHistory: React.FC<BedsideNoteHistoryProps> = ({
  history,
  pinnedId,
  onPin,
  renderDiff,
}) => {
  const pinnedEntry = useMemo(() => history.find(item => item.memoryId === pinnedId) || null, [history, pinnedId]);

  if (history.length === 0) {
    return <p className="text-xs text-[var(--text-tertiary)]">No bedside-note history yet.</p>;
  }

  return (
    <div className="space-y-2">
      {history.map((entry, index) => {
        const compareText = pinnedEntry && pinnedEntry.memoryId !== entry.memoryId
          ? pinnedEntry.text
          : history[index - 1]?.text || '';
        const changes = renderDiff(entry.text, compareText);
        const isPinned = entry.memoryId === pinnedId;
        const timestamp = new Date(entry.timestamp).toLocaleString();

        return (
          <div key={entry.memoryId} className="border border-[var(--border-primary)] rounded p-3 bg-[var(--surface-tertiary)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Version {entry.version}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{timestamp}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                {entry.changeReason && <span className="px-2 py-1 rounded bg-[var(--interactive-bg)] text-[var(--text-primary)]">{entry.changeReason}</span>}
                {entry.changeType && <span className="px-2 py-1 rounded bg-[var(--surface-secondary)]">{entry.changeType}</span>}
                <button
                  type="button"
                  onClick={() => onPin(isPinned ? null : entry.memoryId)}
                  className={`px-2 py-1 rounded border ${isPinned ? 'border-[var(--interactive-accent)] text-[var(--interactive-accent)]' : 'border-[var(--border-primary)] text-[var(--text-secondary)]'}`}
                >
                  {isPinned ? 'Pinned' : 'Pin'}
                </button>
              </div>
            </div>

            <DiffView changes={changes} />
          </div>
        );
      })}
    </div>
  );
};

export default BedsideNoteHistory;
