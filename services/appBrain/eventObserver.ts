import { evolveBedsideNote } from '@/services/memory';
import { eventBus } from './eventBus';
import type { AppEvent, ChapterIssueSummary, WatchedEntitySummary } from './types';

const formatIssue = (issue: ChapterIssueSummary): string | null => {
  if (!issue.description) return null;
  const severityLabel = issue.severity ? issue.severity.toUpperCase() : null;
  return severityLabel ? `${severityLabel}: ${issue.description}` : issue.description;
};

const formatWatchedEntity = (entity: WatchedEntitySummary): string | null => {
  if (!entity.name) return null;
  const reason = entity.reason ? ` (${entity.reason})` : '';
  return `${entity.name}${reason}`;
};

const handleChapterChanged = async (event: Extract<AppEvent, { type: 'CHAPTER_CHANGED' }>) => {
  const issues = (event.payload.issues || [])
    .map(formatIssue)
    .filter((issue): issue is string => Boolean(issue));
  const watched = (event.payload.watchedEntities || [])
    .map(formatWatchedEntity)
    .filter((entry): entry is string => Boolean(entry));

  const reminders = [...issues, ...watched];
  if (reminders.length === 0) return;

  const summary = reminders
    .slice(0, 5)
    .map(item => `- ${item}`)
    .join('\n');

  const noteText = `Now in Chapter ${event.payload.title} — remember:\n${summary}`;

  try {
    await evolveBedsideNote(event.payload.projectId, noteText, {
      changeReason: 'chapter_transition',
    });
  } catch (error) {
    console.warn('[AppBrain] Failed to evolve bedside note on chapter change', error);
  }
};

export const startAppBrainEventObserver = (): (() => void) => {
  const unsubscribe = eventBus.subscribe('CHAPTER_CHANGED', (event) => {
    void handleChapterChanged(event);
  });

  return () => {
    unsubscribe();
  };
};
