import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoResize } from '@/features/editor/hooks/useAutoResize';

const AutoResizeHarness = forwardRef(
  (
    { initialValue, mode }: { initialValue: string; mode: string },
    ref: React.Ref<{ setValue: (val: string) => void }>
  ) => {
    const [value, setValue] = useState(initialValue);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    useAutoResize(textareaRef, value, mode);

    useImperativeHandle(ref, () => ({ setValue }));

    return <textarea data-testid="auto-textarea" ref={textareaRef} />;
  }
);

describe('useAutoResize', () => {
  const rafCallbacks: FrameRequestCallback[] = [];
  let requestSpy: ReturnType<typeof vi.spyOn>;
  let cancelSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rafCallbacks.length = 0;
    requestSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
    cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('schedules and applies resize when in editor mode', async () => {
    const ref = React.createRef<{ setValue: (val: string) => void }>();
    const { getByTestId } = render(<AutoResizeHarness ref={ref} initialValue="hello" mode="EDITOR" />);
    const textarea = getByTestId('auto-textarea') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'scrollHeight', { value: 120, configurable: true });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const cb = rafCallbacks.shift();
    cb?.(0);

    expect(textarea.style.height).toBe('120px');

    await act(async () => {
      ref.current?.setValue('updated');
    });

    await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(2));
  });

  it('does not schedule resize outside of editor mode', () => {
    render(<AutoResizeHarness initialValue="hello" mode="VIEW" />);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('cancels any pending resize on unmount', () => {
    const { unmount } = render(<AutoResizeHarness initialValue="hello" mode="EDITOR" />);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    unmount();
    expect(cancelSpy).toHaveBeenCalledWith(1);
  });
});
