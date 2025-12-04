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

const { getOrCreateBedsideNote, evolveBedsideNote } = chains;

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
    expect(createInput.structuredContent).toBe(structuredContent);
    expect(result.id).toBe('bed-evolved');
  });
});
