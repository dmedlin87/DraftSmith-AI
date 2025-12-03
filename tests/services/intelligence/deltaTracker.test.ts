import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  ChangeHistory,
  detectChanges,
  hasContentChanged,
  hashContent,
} from '../../../services/intelligence/deltaTracker';
import { TextChange } from '../../../types/intelligence';

describe('hashing helpers', () => {
  it('produces consistent hashes for the same input and different hashes for different input', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const sameTextHash = hashContent(text);
    const repeatedHash = hashContent(text);
    const differentHash = hashContent('Another string entirely');

    expect(sameTextHash).toBe(repeatedHash);
    expect(sameTextHash).not.toBe(differentHash);
  });

  it('detects changes based on hash comparisons', () => {
    const original = 'unchanged text';
    const originalHash = hashContent(original);

    expect(hasContentChanged(originalHash, original)).toBe(false);
    expect(hasContentChanged(originalHash, 'modified text')).toBe(true);
  });
});

describe('detectChanges', () => {
  const fixedTimestamp = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTimestamp);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects pure insert operations', () => {
    const result = detectChanges('Hello', 'Hello world');

    expect(result.hasChanges).toBe(true);
    expect(result.changes).toEqual([
      {
        start: 5,
        end: 5,
        changeType: 'insert',
        newText: ' world',
        timestamp: fixedTimestamp,
      },
    ]);
  });

  it('detects pure delete operations', () => {
    const result = detectChanges('Hello world', 'Hello');

    expect(result.hasChanges).toBe(true);
    expect(result.changes).toEqual([
      {
        start: 5,
        end: 11,
        changeType: 'delete',
        oldText: ' world',
        timestamp: fixedTimestamp,
      },
    ]);
  });

  it('detects replacements as modify operations', () => {
    const result = detectChanges('Hello world', 'Hello there');

    expect(result.hasChanges).toBe(true);
    expect(result.changes).toEqual([
      {
        start: 6,
        end: 11,
        changeType: 'modify',
        oldText: 'world',
        newText: 'there',
        timestamp: fixedTimestamp,
      },
    ]);
  });

  it('returns no changes for identical content', () => {
    const result = detectChanges('Same text', 'Same text');

    expect(result.hasChanges).toBe(false);
    expect(result.changes).toEqual([]);
  });
});

describe('ChangeHistory', () => {
  const baseChange = (overrides: Partial<TextChange> = {}): TextChange => ({
    start: 0,
    end: 0,
    changeType: 'insert',
    timestamp: Date.now(),
    ...overrides,
  });

  it('tracks changes up to the configured max size', () => {
    const history = new ChangeHistory(3);

    history.addChange(baseChange({ timestamp: 1 }));
    history.addChange(baseChange({ timestamp: 2 }));
    history.addChange(baseChange({ timestamp: 3 }));
    history.addChange(baseChange({ timestamp: 4 }));

    expect(history.length).toBe(3);
    expect(history.getRecent(3).map(change => change.timestamp)).toEqual([2, 3, 4]);
  });

  it('supports adding batches of changes and retrieving recent entries in order', () => {
    const history = new ChangeHistory(5);
    const changes = [
      baseChange({ timestamp: 1 }),
      baseChange({ timestamp: 2 }),
      baseChange({ timestamp: 3 }),
    ];

    history.addChanges(changes);

    expect(history.length).toBe(3);
    expect(history.getRecent(2).map(change => change.timestamp)).toEqual([2, 3]);
  });

  it('filters changes since a given timestamp', () => {
    const history = new ChangeHistory();

    history.addChange(baseChange({ timestamp: 10 }));
    history.addChange(baseChange({ timestamp: 20 }));
    history.addChange(baseChange({ timestamp: 30 }));

    expect(history.getChangesSince(15).map(change => change.timestamp)).toEqual([20, 30]);
    expect(history.getChangesSince(30)).toEqual([]);
  });

  it('clears history and tracks length correctly', () => {
    const history = new ChangeHistory();

    history.addChange(baseChange({ timestamp: 1 }));
    history.addChange(baseChange({ timestamp: 2 }));
    expect(history.length).toBe(2);

    history.clear();
    expect(history.length).toBe(0);
    expect(history.getRecent()).toEqual([]);
  });
});
