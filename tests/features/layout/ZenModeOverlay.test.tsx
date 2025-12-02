import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ZenModeOverlay } from '@/features/layout/ZenModeOverlay';
import { useLayoutStore } from '@/features/layout/store/useLayoutStore';

describe('ZenModeOverlay', () => {
  beforeEach(() => {
    useLayoutStore.setState({ isExitZenHovered: false, isHeaderHovered: false });
  });

  it('returns null when zen mode is inactive', () => {
    const { container } = render(<ZenModeOverlay isZenMode={false} toggleZenMode={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders exit controls and toggles store hover state', () => {
    const toggleZenMode = vi.fn();
    const { container } = render(<ZenModeOverlay isZenMode toggleZenMode={toggleZenMode} />);

    const hoverZone = container.querySelector('div');
    expect(hoverZone).not.toBeNull();
    fireEvent.mouseEnter(hoverZone!);
    expect(useLayoutStore.getState().isHeaderHovered).toBe(true);

    const button = screen.getByRole('button', { name: /exit zen/i });
    fireEvent.mouseEnter(button);
    expect(useLayoutStore.getState().isExitZenHovered).toBe(true);

    fireEvent.click(button);
    expect(toggleZenMode).toHaveBeenCalled();
  });
});
