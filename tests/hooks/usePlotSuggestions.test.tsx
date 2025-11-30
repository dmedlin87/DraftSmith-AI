import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ModelConfig } from '@/config/models';

const generatePlotIdeasMock = vi.fn();
const trackUsageMock = vi.fn();

vi.mock('@/services/gemini/analysis', () => ({
  generatePlotIdeas: (...args: unknown[]) => generatePlotIdeasMock(...args)
}));

vi.mock('@/features/shared/context/UsageContext', () => ({
  useUsage: () => ({ trackUsage: trackUsageMock })
}));

import { usePlotSuggestions } from '@/features/shared/hooks/usePlotSuggestions';

const baseResponse = {
  result: [{ idea: 'twist' }],
  usage: { promptTokenCount: 3, totalTokenCount: 5 }
};

describe('usePlotSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generatePlotIdeasMock.mockResolvedValue(baseResponse);
  });

  it('does not generate when text is empty', async () => {
    const { result } = renderHook(() => usePlotSuggestions('   '));

    await act(async () => {
      await result.current.generate('query', 'type');
    });

    expect(generatePlotIdeasMock).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
  });

  it('stores suggestions and usage when successful', async () => {
    const { result } = renderHook(() => usePlotSuggestions('story text'));

    await act(async () => {
      await result.current.generate('mystery', 'plot');
    });

    expect(generatePlotIdeasMock).toHaveBeenCalledWith('story text', 'mystery', 'plot');
    expect(trackUsageMock).toHaveBeenCalledWith(baseResponse.usage, ModelConfig.analysis);
    expect(result.current.suggestions).toEqual(baseResponse.result);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('handles racing requests by keeping latest result', async () => {
    const firstResolve: { resolve?: (value: unknown) => void } = {};
    const firstPromise = new Promise(resolve => { firstResolve.resolve = resolve; });
    generatePlotIdeasMock
      .mockImplementationOnce(() => firstPromise as Promise<unknown>)
      .mockResolvedValueOnce({ result: [{ idea: 'new' }], usage: { promptTokenCount: 1, totalTokenCount: 2 } });

    const { result } = renderHook(() => usePlotSuggestions('story text'));

    await act(async () => {
      const first = result.current.generate('first', 'plot');
      const second = result.current.generate('second', 'plot');
      await second;
      firstResolve.resolve?.(baseResponse);
      await first;
    });

    expect(result.current.suggestions).toEqual([{ idea: 'new' }]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('captures error for latest request only', async () => {
    const error = new Error('fail');
    generatePlotIdeasMock.mockRejectedValueOnce(error);

    const { result } = renderHook(() => usePlotSuggestions('story text'));

    await act(async () => {
      await result.current.generate('oops', 'plot');
    });

    expect(result.current.error).toBe('Failed to generate ideas. Please try again.');
    expect(result.current.isLoading).toBe(false);
  });
});
