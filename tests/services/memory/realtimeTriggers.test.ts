import { describe, it, expect, vi, beforeEach } from 'vitest';

const memoryMocks = vi.hoisted(() => ({
  searchMemoriesByTags: vi.fn(),
  getMemoriesCached: vi.fn(),
}));

vi.mock('@/services/memory', () => ({
  searchMemoriesByTags: (...args: any[]) => memoryMocks.searchMemoriesByTags(...args),
  getMemoriesCached: (...args: any[]) => memoryMocks.getMemoriesCached(...args),
}));

describe('realtimeTriggers', () => {
  const projectId = 'proj-1';

  beforeEach(() => {
    vi.resetModules();
    memoryMocks.searchMemoriesByTags.mockReset();
    memoryMocks.getMemoriesCached.mockReset();

    memoryMocks.searchMemoriesByTags.mockResolvedValue([
      {
        id: 'm1',
        projectId,
        text: 'John has green eyes',
        topicTags: ['character:john', 'appearance'],
        type: 'lore',
      },
    ]);

    memoryMocks.getMemoriesCached.mockResolvedValue([
      {
        id: 'c1',
        projectId,
        text: 'Absolute claim flagged earlier',
        topicTags: ['contradiction', 'inconsistency'],
        type: 'issue',
      },
    ]);
  });

  it('checkTriggers detects default triggers (character mention) and returns formatted suggestion', async () => {
    const { checkTriggers } = await import('@/services/memory/realtimeTriggers');

    const results = await checkTriggers("John said he'd return", projectId);

    expect(memoryMocks.searchMemoriesByTags).toHaveBeenCalledWith(['character:john'], {
      projectId,
      limit: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      triggerId: 'character_mention',
      triggerName: 'Character Reference',
      priority: 'debounced',
    });
    expect(results[0].suggestion).toContain('📝 Remember about John');
  });

  it('checkImmediateTriggers only returns immediate priority items (physical description)', async () => {
    const { checkImmediateTriggers } = await import('@/services/memory/realtimeTriggers');

    const results = await checkImmediateTriggers("Anna's eyes were bright blue", projectId);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      triggerId: 'physical_description',
      priority: 'immediate',
    });
    expect(memoryMocks.searchMemoriesByTags).toHaveBeenCalledWith(
      ['character:anna', 'eyes'],
      { projectId, limit: 3 },
    );
    expect(results[0].suggestion).toContain('⚠️ Existing description');
  });

  it('checkDebouncedTriggers only returns debounced items (location reference)', async () => {
    const { checkDebouncedTriggers } = await import('@/services/memory/realtimeTriggers');

    memoryMocks.searchMemoriesByTags.mockResolvedValueOnce([
      {
        id: 'loc1',
        projectId,
        text: 'The Castle has hidden tunnels.',
        topicTags: ['location:castle', 'setting'],
        type: 'lore',
      },
    ]);

    const results = await checkDebouncedTriggers('We went to the Castle gate', projectId);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      triggerId: 'location',
      priority: 'debounced',
    });
    expect(results[0].suggestion).toContain('📍 About Castle');
  });

  it('formatSuggestion handles contradiction alert and uses cached memories', async () => {
    const { checkImmediateTriggers } = await import('@/services/memory/realtimeTriggers');

    const results = await checkImmediateTriggers('It was the first time she spoke', projectId);

    expect(memoryMocks.getMemoriesCached).toHaveBeenCalledWith(projectId, { limit: 50 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      triggerId: 'contradiction_risk',
      priority: 'immediate',
    });
    expect(results[0].suggestion).toContain('known inconsistencies');
  });

  it('gracefully handles memoryQuery errors', async () => {
    const { checkTriggers } = await import('@/services/memory/realtimeTriggers');

    memoryMocks.searchMemoriesByTags.mockRejectedValueOnce(new Error('dexie down'));

    const results = await checkTriggers("Mara said she'd stay", projectId);

    expect(results).toHaveLength(0);
  });
});
