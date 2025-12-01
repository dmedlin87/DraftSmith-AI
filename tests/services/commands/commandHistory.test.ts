import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { CommandHistory } from '@/services/commands';

// Ensure crypto.randomUUID is stable for tests without overriding the crypto object
beforeAll(() => {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('test-id' as any);
  }
});

describe('CommandHistory', () => {
  let history: CommandHistory;

  beforeEach(() => {
    history = new CommandHistory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  const baseCommand = {
    toolName: 'navigate_to_text',
    params: { query: 'Hello', limit: 5 },
    result: 'ok',
    success: true,
    reversible: false,
  } as const;

  it('records commands and trims to max history size', () => {
    for (let i = 0; i < 60; i++) {
      history.record({ ...baseCommand, result: `r${i}` });
    }

    const recent = history.getRecent();
    expect(recent).toHaveLength(10);

    const all = history.getAll();
    expect(all).toHaveLength(50); // Max history size
    expect(all[0].result).toBe('r10');
    expect(all[all.length - 1].result).toBe('r59');
  });

  it('filters by tool, success and reversibility', () => {
    history.record({ ...baseCommand, toolName: 't1', success: true, reversible: true });
    history.record({ ...baseCommand, toolName: 't2', success: true, reversible: true });
    history.record({ ...baseCommand, toolName: 't1', success: false, reversible: false });

    expect(history.getByTool('t1')).toHaveLength(2);
    expect(history.getSuccessful()).toHaveLength(2);
    expect(history.getFailed()).toHaveLength(1);
    expect(history.getReversible()).toHaveLength(2);
  });

  it('notifies subscribers when history changes', () => {
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);

    history.record(baseCommand);
    history.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    const [firstCall] = listener.mock.calls[0];
    expect(Array.isArray(firstCall)).toBe(true);

    unsubscribe();
  });

  it('persists and restores from sessionStorage', () => {
    history.record(baseCommand);
    history.persist();

    const restored = CommandHistory.restore();
    expect(restored).toBeInstanceOf(CommandHistory);
  });

  it('formatForPrompt returns empty string when history is empty', () => {
    const formatted = history.formatForPrompt();
    expect(formatted).toBe('');
  });

  it('formatForPrompt includes tool name, params and time info', () => {
    history.record({ ...baseCommand, result: 'Longer result string that should be truncated for preview in prompt' });

    // Advance time to ensure "time ago" formatting kicks in
    vi.setSystemTime(new Date('2024-01-01T00:10:00Z'));

    const formatted = history.formatForPrompt(5);

    expect(formatted).toContain('[RECENT AGENT ACTIONS]');
    expect(formatted).toContain('navigate_to_text');
    expect(formatted).toContain('query: "Hello"');
    expect(formatted).toContain('10m ago');
  });
});
