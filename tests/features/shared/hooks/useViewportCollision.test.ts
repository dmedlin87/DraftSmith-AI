import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  calculateSafePosition,
  useViewportCollision,
  useMeasuredCollision,
} from '@/features/shared/hooks/useViewportCollision';

declare global {
  interface Window {
    ResizeObserver: typeof ResizeObserver;
  }
}

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 800 });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: 600 });
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: originalWidth });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: originalHeight });
});

describe('calculateSafePosition', () => {
  it('shifts horizontally and flips vertically based on viewport', () => {
    const collision = calculateSafePosition({ top: 20, left: 10 });

    expect(collision.adjusted).toBe(true);
    expect(collision.adjustments.horizontal).toBe('right');

    const flipped = calculateSafePosition(
      { top: 700, left: 300 },
      { preferVertical: 'below' }
    );

    expect(flipped.adjustments.vertical).toBe('up');
    expect(flipped.top).toBeLessThan(700);
  });
});

describe('useViewportCollision', () => {
  it('recalculates when viewport changes', async () => {
    const { result } = renderHook(() => useViewportCollision({ top: 10, left: 10 }));

    expect(result.current?.adjusted).toBe(true);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 300 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current?.left).toBeGreaterThan(100);
  });
});

describe('useMeasuredCollision', () => {
  beforeEach(() => {
    class MockResizeObserver {
      callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe() {
        this.callback([{ contentRect: { width: 600, height: 300 } } as ResizeObserverEntry], this as any);
      }

      disconnect() {}
    }

    // @ts-expect-error jsdom global assignment
    window.ResizeObserver = MockResizeObserver;
  });

  it('uses measured dimensions for collision detection', async () => {
    const element = {
      getBoundingClientRect: vi.fn(() => ({ width: 500, height: 250 })),
    } as unknown as HTMLElement;

    const ref = { current: element } as React.RefObject<HTMLElement>;

    Object.defineProperty(window, 'innerWidth', { writable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 320 });

    const { result } = renderHook(() =>
      useMeasuredCollision({ top: 40, left: 40 }, ref, { padding: 10, preferVertical: 'below' })
    );

    await waitFor(() => expect(result.current).not.toBeNull());

    expect(element.getBoundingClientRect).toHaveBeenCalled();
    expect(result.current?.adjusted).toBe(true);
    expect(result.current?.adjustments.vertical).toBe('up');
  });
});

