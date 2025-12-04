import { describe, it, expect } from 'vitest';
import { applyBedsideNoteMutationLocally } from '@/services/memory/bedsideNoteMutations';
import { BedsideNoteContent } from '@/services/memory';

describe('applyBedsideNoteMutationLocally', () => {
  it('sets and replaces bedside-note sections', () => {
    const base: BedsideNoteContent = {
      currentFocus: 'Old focus',
      warnings: ['keep track of names'],
    };

    const { nextContent, text } = applyBedsideNoteMutationLocally(base, {
      section: 'currentFocus',
      action: 'set',
      content: 'New focus',
    });

    expect(nextContent.currentFocus).toBe('New focus');
    expect(text).toContain('New focus');
  });

  it('appends new list items without duplicates', () => {
    const base: BedsideNoteContent = {
      nextSteps: ['Revise opening'],
    };

    const { nextContent, text } = applyBedsideNoteMutationLocally(base, {
      section: 'nextSteps',
      action: 'append',
      content: ['Revise opening', 'Add motif'],
    });

    expect(nextContent.nextSteps).toEqual(['Revise opening', 'Add motif']);
    expect(text).toContain('Add motif');
  });

  it('removes items and cleans up empty arrays', () => {
    const base: BedsideNoteContent = {
      openQuestions: ['Where is the locket?'],
    };

    const { nextContent, text } = applyBedsideNoteMutationLocally(base, {
      section: 'openQuestions',
      action: 'remove',
      content: 'Where is the locket?',
    });

    expect(nextContent.openQuestions).toBeUndefined();
    expect(text).not.toContain('locket');
  });
});
