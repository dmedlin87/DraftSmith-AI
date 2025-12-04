import { serializeBedsideNote, BedsideNoteSectionKey } from './bedsideNoteSerializer';
import { BedsideNoteContent, BedsideNoteGoalSummary, MemoryNote } from './types';
import { evolveBedsideNote, getOrCreateBedsideNote } from './chains';

export type BedsideNoteAction = 'set' | 'append' | 'remove';

export interface BedsideNoteMutationRequest {
  section: BedsideNoteSectionKey;
  action: BedsideNoteAction;
  content: unknown;
}

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
};

const toGoalArray = (value: unknown): BedsideNoteGoalSummary[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? { title: item } : item))
      .filter((item): item is BedsideNoteGoalSummary =>
        !!item && typeof item === 'object' && 'title' in item && typeof (item as any).title === 'string'
      );
  }

  if (typeof value === 'object' && value !== null && 'title' in value) {
    return [value as BedsideNoteGoalSummary];
  }

  if (typeof value === 'string') {
    return [{ title: value }];
  }

  return [];
};

const mergeUnique = (existing: string[] = [], additions: string[]): string[] => {
  const set = new Set(existing);
  additions.forEach(item => set.add(item));
  return Array.from(set);
};

export function applyBedsideNoteMutationLocally(
  baseContent: BedsideNoteContent,
  mutation: BedsideNoteMutationRequest,
): { nextContent: BedsideNoteContent; text: string } {
  const nextContent: BedsideNoteContent = { ...baseContent };

  switch (mutation.section) {
    case 'currentFocus': {
      const value = typeof mutation.content === 'string' ? mutation.content : '';
      if (mutation.action === 'set') {
        nextContent.currentFocus = value;
      } else if (mutation.action === 'append' && value) {
        nextContent.currentFocus = nextContent.currentFocus
          ? `${nextContent.currentFocus}\n${value}`
          : value;
      } else if (mutation.action === 'remove') {
        if ((nextContent.currentFocus || '').trim() === value.trim()) {
          delete nextContent.currentFocus;
        }
      }
      break;
    }

    case 'warnings':
    case 'nextSteps':
    case 'openQuestions':
    case 'recentDiscoveries': {
      const values = toArray(mutation.content);
      const current = (nextContent[mutation.section] as string[] | undefined) ?? [];

      if (mutation.action === 'set') {
        nextContent[mutation.section] = values;
      } else if (mutation.action === 'append') {
        nextContent[mutation.section] = mergeUnique(current, values);
      } else if (mutation.action === 'remove') {
        const toRemove = new Set(values.map(v => v.trim().toLowerCase()));
        nextContent[mutation.section] = current.filter(item => !toRemove.has(item.trim().toLowerCase()));
        if ((nextContent[mutation.section] as string[]).length === 0) {
          delete nextContent[mutation.section];
        }
      }
      break;
    }

    case 'activeGoals': {
      const goals = toGoalArray(mutation.content);
      const currentGoals = nextContent.activeGoals ?? [];

      if (mutation.action === 'set') {
        nextContent.activeGoals = goals;
      } else if (mutation.action === 'append') {
        const titles = new Set(currentGoals.map(goal => goal.title.toLowerCase()));
        const merged = [...currentGoals];
        for (const goal of goals) {
          if (!titles.has(goal.title.toLowerCase())) {
            merged.push(goal);
          }
        }
        nextContent.activeGoals = merged;
      } else if (mutation.action === 'remove') {
        const titlesToRemove = new Set(goals.map(goal => goal.title.toLowerCase()));
        nextContent.activeGoals = currentGoals.filter(goal => !titlesToRemove.has(goal.title.toLowerCase()));
        if (nextContent.activeGoals.length === 0) {
          delete nextContent.activeGoals;
        }
      }
      break;
    }

    default:
      break;
  }

  const { text } = serializeBedsideNote(nextContent);
  return { nextContent, text };
}

export async function applyBedsideNoteMutation(
  projectId: string,
  mutation: BedsideNoteMutationRequest,
): Promise<MemoryNote> {
  if (!projectId) {
    throw new Error('projectId is required to update the bedside note');
  }

  const bedsideNote = await getOrCreateBedsideNote(projectId);
  const baseContent = (bedsideNote.structuredContent as BedsideNoteContent | undefined) || {};
  const { nextContent, text } = applyBedsideNoteMutationLocally(baseContent, mutation);

  return evolveBedsideNote(projectId, text, {
    changeReason: `agent_${mutation.action}_${mutation.section}`,
    structuredContent: nextContent,
  });
}
