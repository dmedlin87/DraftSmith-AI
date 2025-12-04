import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus, emitChapterChanged, startAppBrainEventObserver } from '@/services/appBrain';
import { evolveBedsideNote } from '@/services/memory';

vi.mock('@/services/memory', () => ({
  evolveBedsideNote: vi.fn(),
}));

describe('AppBrain event observer', () => {
  let stopObserver: (() => void) | null = null;

  beforeEach(() => {
    (eventBus as any).clearHistory();
    (eventBus as any).clearPersistentLog();
    vi.clearAllMocks();
    stopObserver = startAppBrainEventObserver();
  });

  afterEach(() => {
    stopObserver?.();
    stopObserver = null;
  });

  it('evolves bedside note with chapter reminders when issues or watched entities exist', async () => {
    emitChapterChanged('proj-1', 'chap-2', 'Rising Action', {
      issues: [{ description: 'Resolve the cliffhanger from Chapter 1', severity: 'warning' }],
      watchedEntities: [{ name: 'Ava', reason: 'Her arc is fragile', priority: 'high' }],
    });

    await vi.waitFor(() => expect(vi.mocked(evolveBedsideNote)).toHaveBeenCalledTimes(1));

    const [projectId, noteText, options] = vi.mocked(evolveBedsideNote).mock.calls[0];
    expect(projectId).toBe('proj-1');
    expect(noteText).toContain('Now in Chapter Rising Action');
    expect(noteText).toContain('Resolve the cliffhanger');
    expect(noteText).toContain('Ava');
    expect(options?.changeReason).toBe('chapter_transition');
  });

  it('ignores chapter changes that lack meaningful reminders', async () => {
    emitChapterChanged('proj-1', 'chap-1', 'Quiet Setup', {});

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(vi.mocked(evolveBedsideNote)).not.toHaveBeenCalled();
  });
});
