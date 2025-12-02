import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { ProjectDashboard } from '@/features/project/components/ProjectDashboard';
import { parseManuscript } from '@/services/manuscriptParser';
import { useProjectStore } from '@/features/project/store/useProjectStore';

vi.mock('@/features/project/store/useProjectStore');
vi.mock('@/features/project/components/ImportWizard', () => ({
  ImportWizard: ({ initialChapters, onConfirm, onCancel }: any) => (
    <div>
      <div data-testid="wizard-step">Wizard reviewing {initialChapters.length} chapters</div>
      <button type="button" onClick={() => onConfirm(initialChapters)}>Complete Import</button>
      <button type="button" onClick={onCancel}>Cancel Import</button>
    </div>
  )
}));
vi.mock('@/services/manuscriptParser', () => ({
  parseManuscript: vi.fn(() => [
    { title: 'Parsed One', content: 'First chapter' },
    { title: 'Parsed Two', content: 'Second chapter' },
  ]),
}));

const mockUseProjectStore = useProjectStore as unknown as Mock;
const mockParseManuscript = parseManuscript as unknown as Mock;

const baseStore = () => ({
  projects: [],
  loadProject: vi.fn(),
  createProject: vi.fn(() => Promise.resolve('new-id')),
  importProject: vi.fn(() => Promise.resolve('import-id')),
});

describe('ProjectDashboard panels and import flow', () => {
  beforeEach(() => {
    mockUseProjectStore.mockReset();
    mockParseManuscript.mockClear();
  });

  it('cycles through import wizard steps and resets dashboard state on completion', async () => {
    const store = baseStore();
    mockUseProjectStore.mockReturnValue(store);

    const originalText = File.prototype.text;
    const textMock = vi.fn().mockResolvedValue('chapter content');
    Object.defineProperty(File.prototype, 'text', { value: textMock, configurable: true });

    render(<ProjectDashboard />);

    // Start import from empty shelf state
    const importButton = screen.getByText('Import Draft').closest('button');
    const fileInput = importButton?.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['chapter content'], 'draft.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Import Draft Settings')).toBeInTheDocument();
    });

    // Configure settings panel
    fireEvent.change(screen.getByPlaceholderText('e.g. The Winds of Winter'), { target: { value: 'Imported Title' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1890s, 2050'), { target: { value: 'Future' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. London, Mars'), { target: { value: 'Mars' } });
    fireEvent.click(screen.getByText('Next: Review Chapters'));

    await waitFor(() => expect(screen.getByTestId('wizard-step')).toBeInTheDocument());
    expect(mockParseManuscript).toHaveBeenCalled();

    // Complete wizard and ensure import happens with settings
    fireEvent.click(screen.getByText('Complete Import'));

    await waitFor(() => {
      expect(store.importProject).toHaveBeenCalledWith(
        'Imported Title',
        expect.any(Array),
        'Me',
        { timePeriod: 'Future', location: 'Mars' }
      );
    });

    // Dashboard surfaces again when wizard completes
    expect(screen.queryByTestId('wizard-step')).not.toBeInTheDocument();

    Object.defineProperty(File.prototype, 'text', { value: originalText ?? undefined, configurable: true });
  });
});
