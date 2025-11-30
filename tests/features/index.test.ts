import { describe, it, expect, vi } from 'vitest';

// Prevent analysis feature imports from touching the real Gemini client or API key
vi.mock('@/services/gemini/client', () => ({
  getClient: () => ({
    models: {
      generateContent: vi.fn(),
    },
  }),
}));

import * as RootFeatures from '@/features';
import * as Shared from '@/features/shared';
import * as Analysis from '@/features/analysis';
import * as Agent from '@/features/agent';
import * as Editor from '@/features/editor';
import * as Layout from '@/features/layout';
import * as Voice from '@/features/voice';
import * as Project from '@/features/project';
import * as Lore from '@/features/lore';

describe('features barrel indexes', () => {
  it('root features index re-exports core feature modules', () => {
    expect(RootFeatures.AnalysisPanel).toBe(Analysis.AnalysisPanel);
    expect(RootFeatures.ChatInterface).toBe(Agent.ChatInterface);
    expect(RootFeatures.RichTextEditor).toBe(Editor.RichTextEditor);
    expect(RootFeatures.MainLayout).toBe(Layout.MainLayout);
    expect(RootFeatures.VoiceMode).toBe(Voice.VoiceMode);
    expect(RootFeatures.ErrorBoundary).toBe(Shared.ErrorBoundary);
  });

  it('feature-specific indexes expose expected components and hooks', () => {
    // Analysis
    expect(typeof Analysis.AnalysisPanel).toBe('function');
    expect(typeof Analysis.BrainstormingPanel).toBe('function');

    // Agent
    expect(typeof Agent.ChatInterface).toBe('function');
    expect(typeof Agent.useAgentService).toBe('function');
    expect(typeof Agent.PersonaSelector).toBe('function');

    // Editor
    expect(['function', 'object']).toContain(typeof Editor.RichTextEditor);
    expect(typeof Editor.useMagicEditor).toBe('function');
    expect(typeof Editor.CommentMark).toBe('object');

    // Layout
    expect(typeof Layout.MainLayout).toBe('function');
    expect(typeof Layout.EditorLayout).toBe('function');

    // Voice
    expect(typeof Voice.VoiceMode).toBe('function');
    expect(typeof Voice.useVoiceSession).toBe('function');
    expect(typeof Voice.useTextToSpeech).toBe('function');

    // Project / Lore
    expect(typeof Project.ProjectDashboard).toBe('function');
    expect(typeof Lore.LoreManager).toBe('function');
  });
});
