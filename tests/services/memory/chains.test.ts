import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as chains from '@/services/memory/chains';
import { BEDSIDE_NOTE_TAG, BEDSIDE_NOTE_DEFAULT_TAGS, type MemoryNote } from '@/services/memory/types';

const memoryMocks = vi.hoisted(() => ({
  getMemories: vi.fn(),
  createMemory: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
}));

vi.mock('@/services/memory/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/memory/index')>();
  return {
    ...actual,
    getMemories: (...args: any[]) => memoryMocks.getMemories(...args),
    createMemory: (...args: any[]) => memoryMocks.createMemory(...args),
    getMemory: (...args: any[]) => memoryMocks.getMemory(...args),
    updateMemory: (...args: any[]) => memoryMocks.updateMemory(...args),
  };
});

const {
  getOrCreateBedsideNote,
  getOrCreateAuthorBedsideNote,
  evolveBedsideNote,
  detectBedsideNoteConflicts,
  seedProjectBedsideNoteFromAuthor,
  recordProjectRetrospective,
} = chains;

describe('memory chains bedside-note helpers', () => {
  const projectId = 'proj-bedside';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getOrCreateBedsideNote creates a bedside-note plan when none exists', async () => {
    const createdNote: MemoryNote = {
      id: 'bed-1',
      scope: 'project',
      projectId,
      type: 'plan',
      text:
        'Project planning notes for this manuscript. This note will be updated over time with key goals, concerns, and constraints.',
      topicTags: BEDSIDE_NOTE_DEFAULT_TAGS,
      importance: 0.85,
      createdAt: Date.now(),
    };

    memoryMocks.getMemories.mockResolvedValueOnce([]);
    memoryMocks.createMemory.mockResolvedValueOnce(createdNote);

    const result = await getOrCreateBedsideNote(projectId);

    expect(memoryMocks.getMemories).toHaveBeenCalledWith({
      scope: 'project',
      projectId,
      type: 'plan',
      topicTags: [BEDSIDE_NOTE_TAG],
      limit: 1,
    });
    expect(memoryMocks.createMemory).toHaveBeenCalledTimes(1);
    expect(result).toBe(createdNote);
  });

  it('getOrCreateBedsideNote reuses an existing bedside-note plan when present', async () => {
    const existing: MemoryNote = {
      id: 'bed-existing',
      scope: 'project',
      projectId,
      type: 'plan',
      text: 'Existing bedside note',
      topicTags: BEDSIDE_NOTE_DEFAULT_TAGS,
      importance: 0.9,
      createdAt: Date.now() - 1000,
    };

    memoryMocks.getMemories.mockResolvedValueOnce([existing]);

    const result = await getOrCreateBedsideNote(projectId);

    expect(memoryMocks.createMemory).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('detectBedsideNoteConflicts flags contradictory statements with heuristics', async () => {
    const conflicts = await detectBedsideNoteConflicts(
      'Sarah has green eyes. Keep Sarah alive.',
      'Sarah has blue eyes. Sarah must die.'
    );

    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0]).toMatchObject({
      previous: 'Sarah has blue eyes',
      current: 'Sarah has green eyes',
      strategy: 'heuristic',
    });
  });

  it('evolveBedsideNote delegates to evolveMemory with chain metadata', async () => {
    const base: MemoryNote = {
      id: 'bed-base',
      scope: 'project',
      projectId,
      type: 'plan',
      text: 'Base bedside note',
      topicTags: BEDSIDE_NOTE_DEFAULT_TAGS,
      importance: 0.8,
      createdAt: Date.now() - 5000,
    };

    memoryMocks.getMemories.mockResolvedValueOnce([base]);
    memoryMocks.getMemory.mockResolvedValueOnce(base);
    memoryMocks.updateMemory.mockResolvedValue(base as MemoryNote);

    memoryMocks.createMemory.mockImplementation(async (input: any) => ({
      ...base,
      ...input,
      id: 'bed-evolved',
      createdAt: Date.now(),
    } as MemoryNote));

    const structuredContent = { currentFocus: 'Updated bedside plan' } as any;
    const result = await evolveBedsideNote(projectId, 'Updated bedside plan text', {
      changeReason: 'analysis_update',
      structuredContent,
    });

    expect(memoryMocks.getMemory).toHaveBeenCalledWith('bed-base');
    expect(memoryMocks.createMemory).toHaveBeenCalledTimes(1);
    const [createInput] = memoryMocks.createMemory.mock.calls[0];
    expect(createInput.text).toBe('Updated bedside plan text');
    expect(createInput.scope).toBe('project');
    expect(createInput.type).toBe('plan');
    expect(createInput.projectId).toBe(projectId);
    expect(createInput.topicTags).toEqual(
      expect.arrayContaining([
        ...BEDSIDE_NOTE_DEFAULT_TAGS,
        expect.stringMatching(/^chain:/),
        expect.stringMatching(/^chain_version:/),
        `supersedes:${base.id}`,
        'change_reason:analysis_update',
      ])
    );
    expect(createInput.structuredContent).toEqual(structuredContent);
    expect(result.id).toBe('bed-evolved');
  });

  it.each(['auto', 'agent', 'user'] as const)(
    'evolveBedsideNote tags conflicts and resolution path (%s)',
    async resolutionStrategy => {
      const base: MemoryNote = {
        id: 'bed-base',
        scope: 'project',
        projectId,
        type: 'plan',
        text: 'Sarah has blue eyes. Keep Sarah alive.',
        topicTags: BEDSIDE_NOTE_DEFAULT_TAGS,
        importance: 0.8,
        createdAt: Date.now() - 5000,
      };

      memoryMocks.getMemories.mockResolvedValueOnce([base]);
      memoryMocks.getMemory.mockResolvedValueOnce(base);

      let createdMemory: MemoryNote | undefined;
      memoryMocks.createMemory.mockImplementation(async (input: any) => {
        createdMemory = {
          ...base,
          ...input,
          id: `bed-evolved-${resolutionStrategy}`,
          createdAt: Date.now(),
        } as MemoryNote;
        return createdMemory;
      });

      memoryMocks.updateMemory.mockImplementation(async (_id: string, updates: any) => ({
        ...(createdMemory as MemoryNote),
        ...updates,
      } as MemoryNote));

      const result = await evolveBedsideNote(projectId, 'Sarah has green eyes. Sarah is not alive.', {
        conflictResolution: resolutionStrategy,
      });

      expect(memoryMocks.createMemory).toHaveBeenCalledTimes(1);
      const [createInput] = memoryMocks.createMemory.mock.calls[0];
      expect(createInput.structuredContent?.conflicts?.[0]).toMatchObject({ resolution: resolutionStrategy });
      expect(createInput.structuredContent?.warnings?.[0]).toContain('Conflict:');

      expect(result.topicTags).toEqual(
        expect.arrayContaining(['conflict:detected', `conflict:resolution:${resolutionStrategy}`])
      );
      expect((result.structuredContent as any)?.conflicts?.[0].resolution).toBe(resolutionStrategy);
    }
  );

  it('rolls chapter bedside updates up to arc and project scopes', async () => {
    const chapterNote: MemoryNote = {
      id: 'bed-chapter',
      scope: 'project',
      projectId,
      type: 'plan',
      text: 'Chapter bedside',
      topicTags: [BEDSIDE_NOTE_TAG, 'chapter:ch-1'],
      importance: 0.8,
      createdAt: Date.now(),
    };

    const arcNote: MemoryNote = {
      ...chapterNote,
      id: 'bed-arc',
      topicTags: [BEDSIDE_NOTE_TAG, 'arc:arc-1'],
    };

    const projectNote: MemoryNote = {
      ...chapterNote,
      id: 'bed-project',
      topicTags: [BEDSIDE_NOTE_TAG],
    };

    memoryMocks.getMemories
      .mockResolvedValueOnce([chapterNote])
      .mockResolvedValueOnce([arcNote])
      .mockResolvedValueOnce([projectNote]);

    memoryMocks.getMemory.mockImplementation(async (id: string) => {
      if (id === chapterNote.id) return chapterNote;
      if (id === arcNote.id) return arcNote;
      if (id === projectNote.id) return projectNote;
      return undefined;
    });

    memoryMocks.createMemory.mockImplementation(async (input: any) => ({
      ...chapterNote,
      ...input,
      id: input.id || `${(input.topicTags || []).join('-')}-next`,
      createdAt: Date.now(),
    }));

    memoryMocks.updateMemory.mockImplementation(async (_id: string, updates: any) => ({
      ...chapterNote,
      ...updates,
    } as MemoryNote));

    await chains.evolveBedsideNote(projectId, 'Fresh insight', {
      chapterId: 'ch-1',
      arcId: 'arc-1',
    });

    const rollupCalls = memoryMocks.createMemory.mock.calls.filter(([input]) =>
      (input.topicTags || []).includes('change_reason:roll_up')
    );
    expect(rollupCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('creates an author-scoped bedside note with author tag', async () => {
    memoryMocks.getMemories.mockResolvedValueOnce([]);

    const createdAuthor: MemoryNote = {
      id: 'author-bed-1',
      scope: 'author',
      type: 'plan',
      text: 'Author bedside notebook — keep cross-project lessons, recurring issues, and style reminders here.',
      topicTags: [BEDSIDE_NOTE_TAG, 'planner:global', 'arc:story', 'scope:author'],
      importance: 0.9,
      createdAt: Date.now(),
    };

    memoryMocks.createMemory.mockResolvedValueOnce(createdAuthor);

    const result = await getOrCreateAuthorBedsideNote();

    expect(memoryMocks.getMemories).toHaveBeenCalledWith({
      scope: 'author',
      type: 'plan',
      topicTags: [BEDSIDE_NOTE_TAG, 'scope:author'],
      limit: 1,
    });
    expect(memoryMocks.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'author', topicTags: expect.arrayContaining(['scope:author']) })
    );
    expect(result).toBe(createdAuthor);
  });

  it('seeds project bedside note with author warnings and tags', async () => {
    const projectBase: MemoryNote = {
      id: 'bed-project',
      scope: 'project',
      projectId,
      type: 'plan',
      text: 'Project planning notes',
      topicTags: [BEDSIDE_NOTE_TAG],
      importance: 0.8,
      createdAt: Date.now(),
    };

    const authorBase: MemoryNote = {
      id: 'bed-author',
      scope: 'author',
      type: 'plan',
      text: 'Author bedside note text',
      topicTags: [BEDSIDE_NOTE_TAG, 'scope:author'],
      importance: 0.9,
      createdAt: Date.now(),
      structuredContent: { warnings: ['Avoid overwriting key symbols'] },
    };

    memoryMocks.getMemories.mockImplementation(async params => {
      if (params.scope === 'author') return [authorBase];
      return [projectBase];
    });

    memoryMocks.getMemory.mockResolvedValue(projectBase);

    memoryMocks.createMemory.mockImplementation(async input => ({
      ...projectBase,
      ...input,
      id: 'bed-project-next',
      createdAt: Date.now(),
    } as MemoryNote));

    memoryMocks.updateMemory.mockImplementation(async (_id: string, updates: any) => ({
      ...projectBase,
      ...updates,
    } as MemoryNote));

    const seeded = await seedProjectBedsideNoteFromAuthor(projectId);

    expect(memoryMocks.createMemory).toHaveBeenCalled();
    const [seedCreateCall] = memoryMocks.createMemory.mock.calls[0];
    expect(seedCreateCall.text).toContain('Author bedside note text');
    const taggedUpdate = memoryMocks.updateMemory.mock.calls.find(([_id, payload]) =>
      (payload.topicTags || []).includes('seeded_from:author_bedside')
    );
    expect(taggedUpdate?.[1].topicTags).toEqual(expect.arrayContaining(['seeded_from:author_bedside']));
  });

  it('records a project retrospective into the author bedside note', async () => {
    const projectBase: MemoryNote = {
      id: 'bed-project',
      scope: 'project',
      projectId,
      type: 'plan',
      text: 'Final bedside focus',
      topicTags: [BEDSIDE_NOTE_TAG],
      importance: 0.8,
      createdAt: Date.now(),
      structuredContent: { warnings: ['Track eye colors'] },
    };

    const authorBase: MemoryNote = {
      id: 'bed-author',
      scope: 'author',
      type: 'plan',
      text: 'Existing author bedside',
      topicTags: [BEDSIDE_NOTE_TAG, 'scope:author'],
      importance: 0.9,
      createdAt: Date.now(),
    };

    memoryMocks.getMemories.mockImplementation(async params => {
      if (params.scope === 'project') return [projectBase];
      return [authorBase];
    });

    memoryMocks.getMemory.mockImplementation(async id => {
      if (id === authorBase.id) return authorBase;
      return projectBase;
    });

    memoryMocks.createMemory.mockImplementation(async input => ({
      ...authorBase,
      ...input,
      id: 'bed-author-next',
      createdAt: Date.now(),
    } as MemoryNote));

    memoryMocks.updateMemory.mockImplementation(async (_id: string, updates: any) => ({
      ...authorBase,
      ...updates,
    } as MemoryNote));

    const result = await recordProjectRetrospective(projectId, { summary: 'Project finished strong' });

    expect(memoryMocks.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'author',
        text: 'Project finished strong',
        topicTags: expect.arrayContaining(['scope:author']),
      })
    );
    expect(result.topicTags).toContain(`retrospective:project:${projectId}`);
  });
});
