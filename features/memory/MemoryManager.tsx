import React, { useEffect, useMemo, useState } from 'react';
import {
  addGoal,
  addWatchedEntity,
  createMemory,
  deleteGoal,
  deleteMemory,
  getGoals,
  getMemories,
  getWatchedEntities,
  removeWatchedEntity,
  updateGoal,
  updateMemory,
  updateWatchedEntity,
} from '@/services/memory';
import {
  AgentGoal,
  CreateGoalInput,
  CreateMemoryNoteInput,
  MemoryNote,
  MemoryNoteType,
  MemoryScope,
  WatchedEntity,
} from '@/services/memory/types';
import { BedsideNotePanel } from './components/BedsideNotePanel';

interface MemoryManagerProps {
  projectId?: string | null;
}

const MEMORY_TYPES: MemoryNoteType[] = ['observation', 'issue', 'fact', 'plan', 'preference'];
const MEMORY_SCOPES: MemoryScope[] = ['project', 'author'];
const GOAL_STATUSES: AgentGoal['status'][] = ['active', 'completed', 'abandoned'];

const defaultMemoryForm = (projectId?: string | null) => ({
  id: undefined as string | undefined,
  text: '',
  type: 'observation' as MemoryNoteType,
  topicTags: '',
  importance: 0.5,
  scope: 'project' as MemoryScope,
  projectId: projectId ?? undefined,
});

const defaultGoalForm: Partial<CreateGoalInput & { id?: string }> = {
  id: undefined,
  title: '',
  description: '',
  status: 'active',
  progress: 0,
};

const defaultEntityForm: Partial<WatchedEntity> = {
  id: undefined,
  name: '',
  reason: '',
  priority: 'medium',
  monitoringEnabled: true,
};

const TagBadge: React.FC<{ label: string }> = ({ label }) => (
  <span className="px-2 py-1 bg-[var(--interactive-bg)] text-[var(--text-secondary)] rounded-full text-xs">{label}</span>
);

export const MemoryManager: React.FC<MemoryManagerProps> = ({ projectId }) => {
  const [projectMemories, setProjectMemories] = useState<MemoryNote[]>([]);
  const [authorMemories, setAuthorMemories] = useState<MemoryNote[]>([]);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [watchedEntities, setWatchedEntities] = useState<WatchedEntity[]>([]);

  const [memoryForm, setMemoryForm] = useState(defaultMemoryForm(projectId));
  const [goalForm, setGoalForm] = useState(defaultGoalForm);
  const [entityForm, setEntityForm] = useState(defaultEntityForm);
  const [error, setError] = useState<string | null>(null);

  const projectGuard = useMemo(() => !projectId, [projectId]);

  const refreshData = async () => {
    if (!projectId) return;
    try {
      const [projectNotes, authorNotes, projectGoals, entities] = await Promise.all([
        getMemories({ scope: 'project', projectId }),
        getMemories({ scope: 'author' }),
        getGoals(projectId),
        getWatchedEntities(projectId),
      ]);
      setProjectMemories(projectNotes);
      setAuthorMemories(authorNotes);
      setGoals(projectGoals);
      setWatchedEntities(entities);
    } catch (err) {
      console.warn('[MemoryManager] Failed to refresh data', err);
    }
  };

  useEffect(() => {
    setMemoryForm(defaultMemoryForm(projectId));
    setGoalForm(defaultGoalForm);
    setEntityForm(defaultEntityForm);
    setError(null);
    if (projectId) {
      refreshData();
    }
  }, [projectId]);

  const handleMemorySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (memoryForm.scope === 'project' && !projectId) {
      setError('Select a project to save project-scoped memories.');
      return;
    }

    const topicTags = memoryForm.topicTags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    const payload: CreateMemoryNoteInput = {
      text: memoryForm.text.trim(),
      type: memoryForm.type,
      topicTags,
      importance: Math.max(0, Math.min(1, memoryForm.importance)),
      scope: memoryForm.scope,
      projectId: memoryForm.scope === 'project' ? projectId ?? undefined : undefined,
    };

    try {
      if (memoryForm.id) {
        await updateMemory(memoryForm.id, payload);
      } else {
        await createMemory(payload);
      }
      setMemoryForm(defaultMemoryForm(projectId));
      refreshData();
    } catch (err: any) {
      setError(err?.message || 'Unable to save memory');
    }
  };

  const startEditMemory = (note: MemoryNote) => {
    setMemoryForm({
      id: note.id,
      text: note.text,
      type: note.type,
      topicTags: note.topicTags.join(', '),
      importance: note.importance,
      scope: note.scope,
      projectId: note.projectId,
    });
  };

  const handleDeleteMemory = async (id: string) => {
    await deleteMemory(id);
    refreshData();
  };

  const handleGoalSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!projectId) {
      setError('Select a project to manage goals.');
      return;
    }

    const payload: CreateGoalInput = {
      projectId,
      title: goalForm.title?.trim() || '',
      description: goalForm.description?.trim(),
      status: goalForm.status || 'active',
      progress: goalForm.progress ?? 0,
    };

    try {
      if (goalForm.id) {
        await updateGoal(goalForm.id, payload);
      } else {
        await addGoal(payload);
      }
      setGoalForm(defaultGoalForm);
      refreshData();
    } catch (err: any) {
      setError(err?.message || 'Unable to save goal');
    }
  };

  const startEditGoal = (goal: AgentGoal) => {
    setGoalForm({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      progress: goal.progress,
    });
  };

  const handleDeleteGoal = async (id: string) => {
    await deleteGoal(id);
    refreshData();
  };

  const handleEntitySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!projectId) {
      setError('Select a project to watch entities.');
      return;
    }

    const payload = {
      projectId,
      name: entityForm.name?.trim() || '',
      priority: entityForm.priority || 'medium',
      reason: entityForm.reason?.trim(),
      monitoringEnabled: entityForm.monitoringEnabled !== false,
    } as const;

    try {
      if (entityForm.id) {
        await updateWatchedEntity(entityForm.id, payload);
      } else {
        await addWatchedEntity(payload);
      }
      setEntityForm(defaultEntityForm);
      refreshData();
    } catch (err: any) {
      setError(err?.message || 'Unable to save watched entity');
    }
  };

  const startEditEntity = (entity: WatchedEntity) => {
    setEntityForm({
      id: entity.id,
      name: entity.name,
      reason: entity.reason,
      priority: entity.priority,
      monitoringEnabled: entity.monitoringEnabled !== false,
    });
  };

  const handleDeleteEntity = async (id: string) => {
    await removeWatchedEntity(id);
    if (entityForm.id === id) {
      setEntityForm(defaultEntityForm);
    }
    refreshData();
  };

  const handleToggleMonitoring = async (entity: WatchedEntity) => {
    await updateWatchedEntity(entity.id, {
      monitoringEnabled: entity.monitoringEnabled === false ? true : !entity.monitoringEnabled,
    });
    refreshData();
  };

  useEffect(() => {
    if (entityForm.monitoringEnabled === undefined) {
      setEntityForm((prev) => ({ ...prev, monitoringEnabled: true }));
    }
  }, [entityForm.monitoringEnabled]);

  if (projectGuard) {
    return (
      <div className="p-4 text-[var(--text-secondary)] text-sm">
        Select a project to manage agent memories, goals, and proactive monitoring.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {error && (
        <div className="bg-[var(--error-50)] border border-[var(--error-200)] text-[var(--error-700)] px-3 py-2 rounded">
          {error}
        </div>
      )}

      <BedsideNotePanel projectId={projectId} goals={goals} />

      {/* Memories Section */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Memories</h4>
          <span className="text-[var(--text-tertiary)] text-xs">Project & Author scoped</span>
        </header>

        <form onSubmit={handleMemorySubmit} className="space-y-2 bg-[var(--surface-secondary)] p-3 rounded-lg border border-[var(--border-primary)]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Scope</label>
              <select
                value={memoryForm.scope}
                onChange={(e) => setMemoryForm((prev) => ({ ...prev, scope: e.target.value as MemoryScope }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              >
                {MEMORY_SCOPES.map(scope => (
                  <option key={scope} value={scope}>
                    {scope === 'project' ? 'Project' : 'Author'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Type</label>
              <select
                value={memoryForm.type}
                onChange={(e) => setMemoryForm((prev) => ({ ...prev, type: e.target.value as MemoryNoteType }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              >
                {MEMORY_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Memory Text</label>
            <textarea
              required
              value={memoryForm.text}
              onChange={(e) => setMemoryForm((prev) => ({ ...prev, text: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={memoryForm.topicTags}
                onChange={(e) => setMemoryForm((prev) => ({ ...prev, topicTags: e.target.value }))}
                placeholder="character:seth, arc, preference"
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Importance (0-1)</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={memoryForm.importance}
                onChange={(e) => setMemoryForm((prev) => ({ ...prev, importance: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {memoryForm.id && (
              <button
                type="button"
                onClick={() => setMemoryForm(defaultMemoryForm(projectId))}
                className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--interactive-accent)] text-white rounded text-sm"
            >
              {memoryForm.id ? 'Update Memory' : 'Add Memory'}
            </button>
          </div>
        </form>

        <div className="space-y-2">
          <h5 className="text-xs uppercase text-[var(--text-tertiary)] tracking-wide">Project Memories</h5>
          <div className="space-y-2">
            {projectMemories.map(note => (
              <div key={note.id} className="p-3 bg-[var(--surface-secondary)] rounded border border-[var(--border-primary)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TagBadge label={note.type} />
                    <span className="text-[var(--text-tertiary)] text-xs">Importance: {note.importance.toFixed(1)}</span>
                  </div>
                  <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
                    <button onClick={() => startEditMemory(note)} className="hover:text-[var(--interactive-accent)]">Edit</button>
                    <button onClick={() => handleDeleteMemory(note.id)} className="hover:text-[var(--error-500)]">Delete</button>
                  </div>
                </div>
                <p className="text-sm text-[var(--text-primary)] mt-1">{note.text}</p>
                {note.topicTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {note.topicTags.map(tag => <TagBadge key={tag} label={tag} />)}
                  </div>
                )}
              </div>
            ))}
            {projectMemories.length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)]">No project memories yet.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h5 className="text-xs uppercase text-[var(--text-tertiary)] tracking-wide">Author Memories</h5>
          <div className="space-y-2">
            {authorMemories.map(note => (
              <div key={note.id} className="p-3 bg-[var(--surface-secondary)] rounded border border-[var(--border-primary)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TagBadge label={note.type} />
                    <span className="text-[var(--text-tertiary)] text-xs">Importance: {note.importance.toFixed(1)}</span>
                  </div>
                  <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
                    <button onClick={() => startEditMemory(note)} className="hover:text-[var(--interactive-accent)]">Edit</button>
                    <button onClick={() => handleDeleteMemory(note.id)} className="hover:text-[var(--error-500)]">Delete</button>
                  </div>
                </div>
                <p className="text-sm text-[var(--text-primary)] mt-1">{note.text}</p>
                {note.topicTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {note.topicTags.map(tag => <TagBadge key={tag} label={tag} />)}
                  </div>
                )}
              </div>
            ))}
            {authorMemories.length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)]">No author memories yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Goals Section */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Goals</h4>
          <span className="text-[var(--text-tertiary)] text-xs">Project scoped</span>
        </header>

        <form onSubmit={handleGoalSubmit} className="space-y-2 bg-[var(--surface-secondary)] p-3 rounded-lg border border-[var(--border-primary)]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Title</label>
              <input
                required
                type="text"
                value={goalForm.title}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Status</label>
              <select
                value={goalForm.status}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, status: e.target.value as AgentGoal['status'] }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              >
                {GOAL_STATUSES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Description</label>
            <textarea
              value={goalForm.description}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Progress</label>
            <input
              type="range"
              min={0}
              max={100}
              value={goalForm.progress}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, progress: Number(e.target.value) }))}
              className="w-full"
            />
            <span className="text-xs text-[var(--text-secondary)]">{goalForm.progress}%</span>
          </div>

          <div className="flex justify-end gap-2">
            {goalForm.id && (
              <button
                type="button"
                onClick={() => setGoalForm(defaultGoalForm)}
                className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--interactive-accent)] text-white rounded text-sm"
            >
              {goalForm.id ? 'Update Goal' : 'Add Goal'}
            </button>
          </div>
        </form>

        <div className="space-y-2">
          {goals.map(goal => (
            <div key={goal.id} className="p-3 bg-[var(--surface-secondary)] rounded border border-[var(--border-primary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TagBadge label={goal.status} />
                  <span className="text-xs text-[var(--text-tertiary)]">{goal.progress}%</span>
                </div>
                <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
                  <button onClick={() => startEditGoal(goal)} className="hover:text-[var(--interactive-accent)]">Edit</button>
                  <button onClick={() => handleDeleteGoal(goal.id)} className="hover:text-[var(--error-500)]">Delete</button>
                </div>
              </div>
              <p className="text-sm text-[var(--text-primary)] mt-1 font-semibold">{goal.title}</p>
              {goal.description && (
                <p className="text-sm text-[var(--text-secondary)] mt-1">{goal.description}</p>
              )}
            </div>
          ))}
          {goals.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">No goals added for this project.</p>
          )}
        </div>
      </section>

      {/* Watched Entities Section */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Proactive Monitoring</h4>
          <span className="text-[var(--text-tertiary)] text-xs">Watched entities</span>
        </header>

        <form onSubmit={handleEntitySubmit} className="space-y-2 bg-[var(--surface-secondary)] p-3 rounded-lg border border-[var(--border-primary)]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Name</label>
              <input
                required
                type="text"
                value={entityForm.name}
                onChange={(e) => setEntityForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Priority</label>
              <select
                value={entityForm.priority}
                onChange={(e) => setEntityForm((prev) => ({ ...prev, priority: e.target.value as WatchedEntity['priority'] }))}
                className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Reason</label>
            <textarea
              value={entityForm.reason}
              onChange={(e) => setEntityForm((prev) => ({ ...prev, reason: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-[var(--surface-tertiary)] border border-[var(--border-primary)] rounded text-sm"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={entityForm.monitoringEnabled !== false}
              onChange={(e) => setEntityForm((prev) => ({ ...prev, monitoringEnabled: e.target.checked }))}
            />
            Enable proactive monitoring
          </label>

          <div className="flex justify-end gap-2">
            {entityForm.id && (
              <button
                type="button"
                onClick={() => setEntityForm(defaultEntityForm)}
                className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--interactive-accent)] text-white rounded text-sm"
            >
              {entityForm.id ? 'Update Entity' : 'Watch Entity'}
            </button>
          </div>
        </form>

        <div className="space-y-2">
          {watchedEntities.map(entity => (
            <div key={entity.id} className="p-3 bg-[var(--surface-secondary)] rounded border border-[var(--border-primary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TagBadge label={entity.priority} />
                  <span className={`text-xs px-2 py-1 rounded ${entity.monitoringEnabled === false ? 'bg-[var(--error-50)] text-[var(--error-600)]' : 'bg-[var(--success-50)] text-[var(--success-700)]'}`}>
                    {entity.monitoringEnabled === false ? 'Monitoring off' : 'Monitoring on'}
                  </span>
                </div>
                <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
                  <button onClick={() => startEditEntity(entity)} className="hover:text-[var(--interactive-accent)]">Edit</button>
                  <button onClick={() => handleToggleMonitoring(entity)} className="hover:text-[var(--interactive-accent)]">
                    {entity.monitoringEnabled === false ? 'Enable' : 'Disable'}
                  </button>
                  <button onClick={() => handleDeleteEntity(entity.id)} className="hover:text-[var(--error-500)]">Delete</button>
                </div>
              </div>
              <p className="text-sm text-[var(--text-primary)] mt-1 font-semibold">{entity.name}</p>
              {entity.reason && (
                <p className="text-sm text-[var(--text-secondary)] mt-1">{entity.reason}</p>
              )}
            </div>
          ))}
          {watchedEntities.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">No watched entities for this project.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default MemoryManager;
