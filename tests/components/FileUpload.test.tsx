import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { FileUpload } from '@/features/project/components/FileUpload';

describe('FileUpload', () => {
  const mockOnTextLoaded = vi.fn();

  beforeEach(() => {
    mockOnTextLoaded.mockClear();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders upload area and textarea', () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    expect(screen.getByText('Upload Manuscript')).toBeInTheDocument();
    expect(screen.getByText('Click to upload draft')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste text here...')).toBeInTheDocument();
  });

  it('handles .txt file upload', async () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const fileContent = 'Chapter 1\n\nThis is a test.';
    const file = new File([fileContent], 'manuscript.txt', { type: 'text/plain' });
    
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    // Mock file.text() method
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(fileContent),
    });
    
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(mockOnTextLoaded).toHaveBeenCalledWith(fileContent, 'manuscript.txt');
    });
  });

  it('handles .md file upload', async () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const fileContent = '# Chapter 1\n\nThis is markdown.';
    const file = new File([fileContent], 'manuscript.md', { type: 'text/plain' });
    
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(fileContent),
    });
    
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(mockOnTextLoaded).toHaveBeenCalledWith(fileContent, 'manuscript.md');
    });
  });

  it('rejects unsupported file types', async () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const file = new File(['data'], 'document.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Please upload a .txt or .md file.');
    });
    expect(mockOnTextLoaded).not.toHaveBeenCalled();
  });

  it('handles pasted text in textarea', () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const textarea = screen.getByPlaceholderText('Paste text here...');
    fireEvent.change(textarea, { target: { value: 'Pasted content here' } });
    
    expect(mockOnTextLoaded).toHaveBeenCalledWith('Pasted content here', 'Untitled Draft');
  });

  it('does not call onTextLoaded for empty textarea', () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const textarea = screen.getByPlaceholderText('Paste text here...');
    fireEvent.change(textarea, { target: { value: '' } });
    
    expect(mockOnTextLoaded).not.toHaveBeenCalled();
  });

  it('renders recent files when provided', () => {
    const recentFiles = [
      { name: 'Draft 1.txt', content: 'Content 1', timestamp: Date.now() - 86400000 },
      { name: 'Draft 2.md', content: 'Content 2', timestamp: Date.now() },
    ];
    
    render(<FileUpload onTextLoaded={mockOnTextLoaded} recentFiles={recentFiles} />);
    
    expect(screen.getByText('Recent Drafts')).toBeInTheDocument();
    expect(screen.getByText('Draft 1.txt')).toBeInTheDocument();
    expect(screen.getByText('Draft 2.md')).toBeInTheDocument();
  });

  it('loads recent file when clicked', () => {
    const recentFiles = [
      { name: 'Draft 1.txt', content: 'Content from draft 1', timestamp: Date.now() },
    ];
    
    const { getByText } = render(<FileUpload onTextLoaded={mockOnTextLoaded} recentFiles={recentFiles} />);
    
    fireEvent.click(getByText('Draft 1.txt'));
    
    expect(mockOnTextLoaded).toHaveBeenCalledWith('Content from draft 1', 'Draft 1.txt');
  });

  it('does not render recent files section when empty', () => {
    const { queryByText } = render(<FileUpload onTextLoaded={mockOnTextLoaded} recentFiles={[]} />);
    
    expect(queryByText('Recent Drafts')).not.toBeInTheDocument();
  });

  it('handles file read error gracefully', async () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockRejectedValue(new Error('Read error')),
    });
    
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Could not read file. Please try a standard .txt or .md file.');
    });
  });

  it('ignores when no file is selected', () => {
    render(<FileUpload onTextLoaded={mockOnTextLoaded} />);
    
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    
    expect(mockOnTextLoaded).not.toHaveBeenCalled();
  });
});
