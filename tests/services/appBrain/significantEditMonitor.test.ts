import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const memoryMocks = vi.hoisted(() => ({
  evolveBedsideNote: vi.fn(),
}));

const eventBusMock = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: any) => void>> = {};
  return {
    subscribe: vi.fn((type: string, handler: (event: any) => void) => {
      handlers[type] ||= [];
      handlers[type].push(handler);
      const unsubscribe = vi.fn(() => {
        handlers[type] = handlers[type].filter(h => h !== handler);
      });
      eventBusMock.lastUnsubscribe = unsubscribe;
      return unsubscribe;
    }),
    emit: (type: string, payload: any) => {
      handlers[type]?.forEach(handler => handler({ type, payload }));
    },
    reset: () => {
      Object.keys(handlers).forEach(key => {
        handlers[key] = [];
      });
      eventBusMock.subscribe.mockReset();
      eventBusMock.lastUnsubscribe = undefined;
    },
    lastUnsubscribe: undefined as undefined | ReturnType<typeof vi.fn>,
  };
});

vi.mock('@/services/appBrain/eventBus', () => ({
  eventBus: {
    subscribe: eventBusMock.subscribe,
  },
  emitTextChanged: (length: number, delta: number) =>
    eventBusMock.emit('TEXT_CHANGED', { length, delta }),
}));

vi.mock('@/services/memory', () => ({
  evolveBedsideNote: (...args: any[]) => memoryMocks.evolveBedsideNote(...args),
}));

describe('significantEditMonitor', () => {
  let startSignificantEditMonitor: (projectId: string, options?: any) => void;
  let stopSignificantEditMonitor: () => void;
  let getSignificantEditMonitor: () => any;
  let emitTextChanged: (length: number, delta: number) => void;
  let latestHandler: ((event: any) => void) | null;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules(); // reset singleton instance
    eventBusMock.reset();
    memoryMocks.evolveBedsideNote.mockReset();
    latestHandler = null;

    const module = await import('@/services/appBrain/significantEditMonitor');
    startSignificantEditMonitor = module.startSignificantEditMonitor;
    stopSignificantEditMonitor = module.stopSignificantEditMonitor;
    getSignificantEditMonitor = module.getSignificantEditMonitor;
    ({ emitTextChanged } = await import('@/services/appBrain/eventBus'));
  });

  afterEach(() => {
    stopSignificantEditMonitor();
    vi.useRealTimers();
  });

  it('start subscribes to TEXT_CHANGED events', () => {
    startSignificantEditMonitor('project-1', { threshold: 500, debounceMs: 200, cooldownMs: 300000 });

    expect(eventBusMock.subscribe).toHaveBeenCalledWith(
      'TEXT_CHANGED',
      expect.any(Function),
    );

    latestHandler = eventBusMock.subscribe.mock.calls.at(-1)?.[1] ?? null;
    expect(latestHandler).toBeInstanceOf(Function);
  });

  it('stop cleans up subscription and pending timers', () => {
    startSignificantEditMonitor('project-1', { threshold: 500, debounceMs: 200 });

    latestHandler = eventBusMock.subscribe.mock.calls.at(-1)?.[1] ?? null;
    expect(latestHandler).toBeTruthy();
    // simulate an edit to create a timer
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 600, length: 1200 } });

    const monitor = getSignificantEditMonitor();
    expect((monitor as any).debounceTimer).not.toBeNull();

    stopSignificantEditMonitor();

    expect(eventBusMock.subscribe).toHaveBeenCalledTimes(1);
    expect((monitor as any).debounceTimer).toBeNull();
  });

  it('does not flush when cumulative delta stays below threshold', async () => {
    startSignificantEditMonitor('project-1', { threshold: 500, debounceMs: 300, cooldownMs: 300000 });

    emitTextChanged(800, 100);
    emitTextChanged(900, 150);
    emitTextChanged(950, 200);

    await vi.advanceTimersByTimeAsync(300);

    expect(memoryMocks.evolveBedsideNote).not.toHaveBeenCalled();
  });

  it('flushes when accumulated delta exceeds threshold after debounce', async () => {
    startSignificantEditMonitor('project-1', { threshold: 500, debounceMs: 300 });

    latestHandler = eventBusMock.subscribe.mock.calls.at(-1)?.[1] ?? null;
    expect(latestHandler).toBeTruthy();

    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 200, length: 1000 } });
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 200, length: 1200 } });
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 200, length: 1400 } });

    const monitor = getSignificantEditMonitor();
    expect((monitor as any).cumulativeDelta).toBe(600);
    expect((monitor as any).debounceTimer).not.toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    await vi.runOnlyPendingTimersAsync();

    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledTimes(1);
    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledWith(
      'project-1',
      'Significant edits detected — analysis may be stale. Run analysis to refresh.',
      { changeReason: 'significant_edit' },
    );
  });

  it('debounces rapid edits and flushes after silence', async () => {
    startSignificantEditMonitor('project-1', { threshold: 500, debounceMs: 400, cooldownMs: 300000 });

    latestHandler = eventBusMock.subscribe.mock.calls.at(-1)?.[1] ?? null;
    expect(latestHandler).toBeTruthy();

    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 300, length: 900 } });
    await vi.advanceTimersByTimeAsync(350); // within debounce window, timer reset expected
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 250, length: 1150 } });

    // No flush yet because timer was reset
    await vi.advanceTimersByTimeAsync(350);
    expect(memoryMocks.evolveBedsideNote).not.toHaveBeenCalled();

    // After final silence passes debounce
    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();

    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledTimes(1);
    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledWith(
      'project-1',
      'Significant edits detected — analysis may be stale. Run analysis to refresh.',
      { changeReason: 'significant_edit' },
    );
  });

  it('respects cooldown to prevent repeated triggers', async () => {
    startSignificantEditMonitor('project-1', { threshold: 300, debounceMs: 50, cooldownMs: 1000 });

    latestHandler = eventBusMock.subscribe.mock.calls.at(-1)?.[1] ?? null;
    expect(latestHandler).toBeTruthy();

    // First burst crosses threshold -> should fire once
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 200, length: 1000 } });
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 150, length: 1150 } });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();

    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledTimes(1);

    // Second burst inside cooldown -> should not fire
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 400, length: 1500 } });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();
    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledTimes(1);

    // After cooldown, should allow next trigger
    await vi.advanceTimersByTimeAsync(1000);
    latestHandler?.({ type: 'TEXT_CHANGED', payload: { delta: 400, length: 1900 } });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();

    expect(memoryMocks.evolveBedsideNote).toHaveBeenCalledTimes(2);
  });

  it('does nothing after stop when events emit', async () => {
    startSignificantEditMonitor('project-1', { threshold: 100, debounceMs: 20, cooldownMs: 1000 });

    stopSignificantEditMonitor();
    emitTextChanged(500, 200);

    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();

    expect(memoryMocks.evolveBedsideNote).not.toHaveBeenCalled();
  });
});
