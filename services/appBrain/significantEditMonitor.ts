import type { AppEvent } from './types';
import { evolveBedsideNote } from '../memory';
import { eventBus } from './eventBus';

interface SignificantEditOptions {
  threshold?: number;
  debounceMs?: number;
  cooldownMs?: number;
}

class SignificantEditMonitor {
  private static instance: SignificantEditMonitor | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cumulativeDelta = 0;
  private projectId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private threshold: number;
  private debounceMs: number;
  private cooldownMs: number;
  private lastTriggerTime = 0;
  private lastHandledTimestamp: number | null = null;

  private constructor(options?: SignificantEditOptions) {
    this.threshold = options?.threshold ?? 500;
    this.debounceMs = options?.debounceMs ?? 300;
    this.cooldownMs = options?.cooldownMs ?? 5 * 60 * 1000; // 5 minutes
  }

  static getInstance(options?: SignificantEditOptions): SignificantEditMonitor {
    if (!this.instance) {
      this.instance = new SignificantEditMonitor(options);
    }
    return this.instance;
  }

  start(projectId: string, options?: SignificantEditOptions) {
    this.stop();

    this.projectId = projectId;
    this.threshold = options?.threshold ?? this.threshold;
    this.debounceMs = options?.debounceMs ?? this.debounceMs;
    this.cooldownMs = options?.cooldownMs ?? this.cooldownMs;

    this.unsubscribe = eventBus.subscribe('TEXT_CHANGED', (event) => {
      this.handleTextChanged(event);
    });
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.projectId = null;
    this.cumulativeDelta = 0;
    this.lastTriggerTime = 0;
    this.lastHandledTimestamp = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  handleTextChanged(event: AppEvent) {
    if (event.type !== 'TEXT_CHANGED') return;

    // Avoid double-processing the same emitted event when multiple subscribers forward it.
    if (event.timestamp && this.lastHandledTimestamp === event.timestamp) {
      return;
    }
    this.lastHandledTimestamp = event.timestamp ?? Date.now();

    this.cumulativeDelta += Math.abs(event.payload.delta);
    this.scheduleDebounce();
  }

  private scheduleDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  private async flush() {
    this.debounceTimer = null;

    if (!this.projectId) {
      this.cumulativeDelta = 0;
      return;
    }

    const now = Date.now();
    const withinCooldown = now - this.lastTriggerTime < this.cooldownMs;

    if (this.cumulativeDelta >= this.threshold && !withinCooldown) {
      try {
        await evolveBedsideNote(
          this.projectId,
          'Significant edits detected — analysis may be stale. Run analysis to refresh.',
          { changeReason: 'significant_edit' },
        );
        this.lastTriggerTime = now;
      } catch (error) {
        console.warn('[SignificantEditMonitor] Failed to evolve bedside note', error);
      }
    }

    this.cumulativeDelta = 0;
  }
}

export const getSignificantEditMonitor = (options?: SignificantEditOptions) =>
  SignificantEditMonitor.getInstance(options);

export const startSignificantEditMonitor = (projectId: string, options?: SignificantEditOptions) =>
  SignificantEditMonitor.getInstance(options).start(projectId, options);

export const stopSignificantEditMonitor = () =>
  SignificantEditMonitor.getInstance().stop();
