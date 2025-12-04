import React, { useEffect, useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { BedsideNoteContent, BedsideNoteSectionKey, MemoryNote, AgentGoal } from '@/services/memory/types';
import { applyBedsideNoteMutation } from '@/services/memory/bedsideNoteMutations';
import { ChainedMemory, getMemoryChain, getOrCreateBedsideNote } from '@/services/memory/chains';
import { BedsideNoteHistory } from './BedsideNoteHistory';
import { MemoryNotifications, MemoryNotification } from './MemoryNotifications';

const SECTION_LABELS: Record<BedsideNoteSectionKey, string> = {
  currentFocus: 'Current Focus',
  warnings: 'Warnings & Risks',
  activeGoals: 'Active Goals',
  nextSteps: 'Next Steps',
  openQuestions: 'Open Questions',
  recentDiscoveries: 'Recent Discoveries',
  conflicts: 'Conflicts',
};

const LIST_SECTIONS: BedsideNoteSectionKey[] = [
  'warnings',
  'nextSteps',
  'openQuestions',
  'recentDiscoveries',
];

const defaultCollapsedState: Record<BedsideNoteSectionKey, boolean> = {
  currentFocus: false,
  warnings: false,
  activeGoals: false,
  nextSteps: false,
  openQuestions: false,
  recentDiscoveries: false,
  conflicts: false,
};

interface BedsideNotePanelProps {
  projectId?: string | null;
  goals?: AgentGoal[];
}

export const BedsideNotePanel: React.FC<BedsideNotePanelProps> = ({ projectId, goals = [] }) => {
  const [note, setNote] = useState<MemoryNote | null>(null);
  const [history, setHistory] = useState<ChainedMemory[]>([]);
  const [collapsed, setCollapsed] = useState(defaultCollapsedState);
  const [listInputs, setListInputs] = useState<Record<BedsideNoteSectionKey, string>>({
    currentFocus: '',
    warnings: '',
    activeGoals: '',
    nextSteps: '',
    openQuestions: '',
    recentDiscoveries: '',
    conflicts: '',
  });
  const [changeReasonFilter, setChangeReasonFilter] = useState<string>('all');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structuredContent: BedsideNoteContent = useMemo(() => {
    if (!note) return {};
    const content = (note.structuredContent as BedsideNoteContent | undefined) || {};
    if (Object.keys(content).length === 0 && note.text) {
      return { currentFocus: note.text };
    }
    return content;
  }, [note]);

  const notifications: MemoryNotification[] = useMemo(() => {
    const entries: MemoryNotification[] = [];
    if (!note) return entries;

    if (history.some(item => (item.changeReason || '').includes('significant'))) {
      entries.push({
        type: 'update',
        title: 'Significant bedside update',
        description: 'Recent bedside-note changes were marked significant.',
      });
    }

    if (structuredContent.conflicts && structuredContent.conflicts.length > 0) {
      entries.push({
        type: 'conflict',
        title: 'Conflicts detected',
        description: `${structuredContent.conflicts.length} potential contradictions need review.`,
      });
    }

    const stalledGoals = goals.filter(
      goal => goal.status === 'active' && (goal.progress ?? 0) < 20 && (!goal.updatedAt || goal.updatedAt < Date.now() - 1000 * 60 * 60 * 24 * 3)
    );
    if (stalledGoals.length > 0) {
      entries.push({
        type: 'goal',
        title: 'Stalled goals',
        description: `${stalledGoals.length} goals look stuck. Consider updating progress.`,
      });
    }

    return entries;
  }, [goals, history, note, structuredContent.conflicts]);

  useEffect(() => {
    if (!projectId) {
      setNote(null);
      setHistory([]);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const latest = await getOrCreateBedsideNote(projectId);
        setNote(latest);
        setListInputs(prev => ({ ...prev, currentFocus: (latest.structuredContent as BedsideNoteContent | undefined)?.currentFocus || '' }));
        const chain = await getMemoryChain(latest.id);
        setHistory(chain);
      } catch (e: any) {
        setError(e?.message || 'Unable to load bedside note');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [projectId]);

  const toggleSection = (section: BedsideNoteSectionKey) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const refreshHistory = async (updated: MemoryNote) => {
    setNote(updated);
    const chain = await getMemoryChain(updated.id);
    setHistory(chain);
  };

  const handleSaveFocus = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const updated = await applyBedsideNoteMutation(projectId, {
        section: 'currentFocus',
        action: 'set',
        content: listInputs.currentFocus,
      });
      await refreshHistory(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to update focus');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddListItem = async (section: BedsideNoteSectionKey) => {
    if (!projectId) return;
    const value = listInputs[section];
    if (!value.trim()) return;
    setIsLoading(true);
    try {
      const updated = await applyBedsideNoteMutation(projectId, {
        section,
        action: 'append',
        content: value.trim(),
      });
      setListInputs(prev => ({ ...prev, [section]: '' }));
      await refreshHistory(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to update bedside note');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveListItem = async (section: BedsideNoteSectionKey, value: string) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const updated = await applyBedsideNoteMutation(projectId, {
        section,
        action: 'remove',
        content: value,
      });
      await refreshHistory(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to update bedside note');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (changeReasonFilter === 'all') return history;
    return history.filter(item => item.changeReason === changeReasonFilter);
  }, [changeReasonFilter, history]);

  const changeReasons = useMemo(() => {
    const unique = new Set<string>();
    history.forEach(item => {
      if (item.changeReason) unique.add(item.changeReason);
    });
    return Array.from(unique);
  }, [history]);

  if (!projectId) {
    return (
      <div className="p-4 bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded">
        Select a project to view bedside notes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Bedside Note</h3>
        <MemoryNotifications notifications={notifications} />
      </div>

      {error && (
        <div className="text-sm text-[var(--error-600)] bg-[var(--error-50)] border border-[var(--error-200)] px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="space-y-3 bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Structured sections</h4>
          {isLoading && <span className="text-xs text-[var(--text-tertiary)]">Updating...</span>}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('currentFocus')}
            className="w-full flex items-center justify-between text-left px-3 py-2 bg-[var(--surface-tertiary)] rounded"
          >
            <span className="font-medium">{SECTION_LABELS.currentFocus}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{collapsed.currentFocus ? 'Expand' : 'Collapse'}</span>
          </button>
          {!collapsed.currentFocus && (
            <div className="space-y-2 p-3 bg-[var(--surface-tertiary)] rounded border border-[var(--border-primary)]">
              <textarea
                value={listInputs.currentFocus}
                onChange={(e) => setListInputs(prev => ({ ...prev, currentFocus: e.target.value }))}
                rows={3}
                className="w-full bg-transparent border border-[var(--border-primary)] rounded p-2 text-sm"
                placeholder="What should we focus on next?"
              />
              <button
                type="button"
                onClick={handleSaveFocus}
                className="px-3 py-2 bg-[var(--interactive-accent)] text-white rounded text-sm"
              >
                Save focus
              </button>
            </div>
          )}
        </div>

        {LIST_SECTIONS.map(section => {
          const items = (structuredContent[section] as string[] | undefined) || [];
          return (
            <div key={section} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleSection(section)}
                className="w-full flex items-center justify-between text-left px-3 py-2 bg-[var(--surface-tertiary)] rounded"
              >
                <span className="font-medium">{SECTION_LABELS[section]}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{collapsed[section] ? 'Expand' : 'Collapse'}</span>
              </button>
              {!collapsed[section] && (
                <div className="space-y-2 p-3 bg-[var(--surface-tertiary)] rounded border border-[var(--border-primary)]">
                  {items.length === 0 && (
                    <p className="text-xs text-[var(--text-tertiary)]">No entries yet.</p>
                  )}
                  {items.map(item => (
                    <div key={item} className="flex items-center justify-between text-sm bg-[var(--surface-secondary)] px-2 py-1 rounded">
                      <span className="text-[var(--text-primary)]">{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveListItem(section, item)}
                        className="text-[var(--error-600)] text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={listInputs[section]}
                      onChange={(e) => setListInputs(prev => ({ ...prev, [section]: e.target.value }))}
                      className="flex-1 bg-transparent border border-[var(--border-primary)] rounded px-2 py-1 text-sm"
                      placeholder={`Add to ${SECTION_LABELS[section].toLowerCase()}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddListItem(section)}
                      className="px-3 py-1 bg-[var(--interactive-bg)] text-[var(--text-primary)] rounded text-sm"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleSection('activeGoals')}
            className="w-full flex items-center justify-between text-left px-3 py-2 bg-[var(--surface-tertiary)] rounded"
          >
            <span className="font-medium">{SECTION_LABELS.activeGoals}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{collapsed.activeGoals ? 'Expand' : 'Collapse'}</span>
          </button>
          {!collapsed.activeGoals && (
            <div className="space-y-2 p-3 bg-[var(--surface-tertiary)] rounded border border-[var(--border-primary)]">
              {structuredContent.activeGoals?.length ? (
                structuredContent.activeGoals.map(goal => (
                  <div key={goal.title} className="flex items-center justify-between text-sm bg-[var(--surface-secondary)] px-2 py-1 rounded">
                    <span className="text-[var(--text-primary)]">
                      {goal.title} {typeof goal.progress === 'number' ? `(${goal.progress}%)` : ''}
                    </span>
                    {goal.status && <span className="text-[var(--text-tertiary)] text-xs">{goal.status}</span>}
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-tertiary)]">No active goals captured yet.</p>
              )}
            </div>
          )}
        </div>

        {structuredContent.conflicts && structuredContent.conflicts.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => toggleSection('conflicts')}
              className="w-full flex items-center justify-between text-left px-3 py-2 bg-[var(--surface-tertiary)] rounded"
            >
              <span className="font-medium">{SECTION_LABELS.conflicts}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{collapsed.conflicts ? 'Expand' : 'Collapse'}</span>
            </button>
            {!collapsed.conflicts && (
              <div className="space-y-2 p-3 bg-[var(--surface-tertiary)] rounded border border-[var(--border-primary)]">
                {structuredContent.conflicts.map(conflict => (
                  <div key={`${conflict.previous}-${conflict.current}`} className="text-sm bg-[var(--surface-secondary)] px-2 py-1 rounded">
                    <p className="text-[var(--text-primary)] font-medium">{conflict.previous}</p>
                    <p className="text-[var(--text-secondary)]">↔ {conflict.current}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">View history</h4>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-[var(--text-tertiary)]" htmlFor="changeReasonSelect">
              Change reason
            </label>
            <select
              id="changeReasonSelect"
              value={changeReasonFilter}
              onChange={(e) => setChangeReasonFilter(e.target.value)}
              className="bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded px-2 py-1"
            >
              <option value="all">All</option>
              {changeReasons.map(reason => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
        </div>
        <BedsideNoteHistory
          history={filteredHistory}
          pinnedId={pinnedId}
          onPin={setPinnedId}
          renderDiff={(currentText: string, previousText: string) =>
            diffLines(previousText || '', currentText || '')
          }
        />
      </div>
    </div>
  );
};

export default BedsideNotePanel;
