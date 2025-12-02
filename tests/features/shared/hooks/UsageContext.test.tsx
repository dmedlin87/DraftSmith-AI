import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useUsage, UsageProvider } from '@/features/shared/context/UsageContext';

describe('UsageContext', () => {
  it('throws when useUsage is called outside of provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useUsage())).toThrowError(
      'useUsage must be used within UsageProvider'
    );

    consoleError.mockRestore();
  });

  it('provides usage tracking when wrapped with provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UsageProvider>{children}</UsageProvider>
    );

    const { result } = renderHook(() => useUsage(), { wrapper });

    expect(typeof result.current.trackUsage).toBe('function');
    expect(result.current.promptTokens).toBe(0);
  });
});

