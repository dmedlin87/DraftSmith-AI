import { describe, it, expect } from 'vitest';
import { estimateTokens } from '@/config/api';
import {
  DEFAULT_BEDSIDE_NOTE_MAX_ITEMS,
  DEFAULT_BEDSIDE_NOTE_SECTION_BUDGETS,
  serializeBedsideNote,
} from '@/services/memory/bedsideNoteSerializer';
import type { BedsideNoteContent } from '@/services/memory/types';

describe('serializeBedsideNote', () => {
  it('serializes structured bedside note content with headings', () => {
    const content: BedsideNoteContent = {
      currentFocus: 'Refine the chapter 3 reveal to sharpen tension.',
      activeGoals: [
        { title: 'Tighten pacing', progress: 25, status: 'active' },
        { title: 'Clarify antagonist motive', progress: 40, status: 'active' },
      ],
      warnings: ['Continuity risk with Sarah\'s eye color.', 'Motivation unclear in Act 2.'],
      nextSteps: ['Re-outline chapter 3 beats.', 'Flag continuity checks for Sarah.'],
    };

    const { text } = serializeBedsideNote(content);

    expect(text).toContain('Current Focus:');
    expect(text).toContain('Active Goals:');
    expect(text).toContain('Warnings & Risks:');
    expect(text).toContain('Next Steps:');
    expect(text.split('\n')).toContainEqual('- Tighten pacing [25%]');
  });

  it('truncates sections to the configured max items and budgets', () => {
    const content: BedsideNoteContent = {
      warnings: [
        'A very long warning that should be trimmed when space is tight',
        'Another warning that will likely be dropped first',
        'Additional warning beyond the allowed max items',
      ],
      activeGoals: Array.from({ length: 6 }).map((_, idx) => ({
        title: `Goal ${idx + 1}`,
        progress: idx * 10,
        status: 'active',
      })),
    };

    const { text } = serializeBedsideNote(content, {
      sectionBudgets: { warnings: 6, activeGoals: 10 },
      maxItems: { warnings: 2, activeGoals: 3 },
    });

    const warningSection = text
      .split('\n\n')
      .find(section => section.startsWith('Warnings')) || '';
    const goalSection = text
      .split('\n\n')
      .find(section => section.startsWith('Active Goals')) || '';

    expect(warningSection.split('\n').filter(line => line.startsWith('- ')).length).toBeLessThanOrEqual(2);
    expect(estimateTokens(warningSection)).toBeLessThanOrEqual(6);
    expect(goalSection.split('\n').filter(line => line.startsWith('- ')).length).toBeLessThanOrEqual(3);
    expect(estimateTokens(goalSection)).toBeLessThanOrEqual(10);
  });

  it('prioritizes the highest-scoring goals when trimming', () => {
    const content: BedsideNoteContent = {
      activeGoals: [
        { title: 'Low progress recent', progress: 10, status: 'active', updatedAt: Date.now() },
        { title: 'High progress', progress: 80, status: 'active', updatedAt: Date.now() - 1000 },
        { title: 'Stalled older', progress: 5, status: 'active', updatedAt: Date.now() - 10_000 },
        { title: 'Completed goal', progress: 100, status: 'completed' },
      ],
    };

    const { text } = serializeBedsideNote(content, {
      maxItems: { activeGoals: 2 },
      sectionBudgets: { activeGoals: DEFAULT_BEDSIDE_NOTE_SECTION_BUDGETS.activeGoals },
    });

    const goalLines = text
      .split('\n\n')
      .find(section => section.startsWith('Active Goals'))
      ?.split('\n')
      .filter(line => line.startsWith('- ')) || [];

    expect(goalLines.length).toBe(2);
    expect(goalLines[0]).toContain('Low progress recent');
    expect(goalLines[1]).toContain('Stalled older');
  });

  it('uses defaults when budgets and max items are not provided', () => {
    const content: BedsideNoteContent = {
      recentDiscoveries: ['Discovery A', 'Discovery B', 'Discovery C', 'Discovery D', 'Discovery E'],
    };

    const { text } = serializeBedsideNote(content);
    const discoveryLines = text
      .split('\n\n')
      .find(section => section.startsWith('Recent Discoveries'))
      ?.split('\n')
      .filter(line => line.startsWith('- ')) || [];

    expect(discoveryLines.length).toBeLessThanOrEqual(DEFAULT_BEDSIDE_NOTE_MAX_ITEMS.recentDiscoveries);
  });
});
