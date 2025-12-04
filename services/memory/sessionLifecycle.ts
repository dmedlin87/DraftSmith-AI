import { evolveBedsideNote, getOrCreateBedsideNote } from './chains';
import { getSessionState } from './sessionTracker';
import { MemoryNote } from './types';

const SESSION_EVENT_DEBOUNCE_MS = 2000;

const lastSessionStart: Map<string, number> = new Map();
const lastSessionEnd: Map<string, number> = new Map();

const eventCooldownHit = (tracker: Map<string, number>, projectId: string): boolean => {
  const now = Date.now();
  const last = tracker.get(projectId) ?? 0;
  if (now - last < SESSION_EVENT_DEBOUNCE_MS) {
    return true;
  }

  tracker.set(projectId, now);
  return false;
};

const formatSessionSummary = (): string => {
  const session = getSessionState();
  const lines: string[] = [];

  if (session.created.length > 0) {
    const createdPreviews = session.created
      .slice(-3)
      .map(note => `• ${note.type}: ${note.text.slice(0, 80)}`);
    lines.push(`Created ${session.created.length} note(s):`, ...createdPreviews);
  }

  if (session.updated.length > 0) {
    const updatePreviews = session.updated
      .slice(-3)
      .map(update => `• ${update.id}: ${update.changes}`);
    lines.push(`Updated ${session.updated.length} note(s):`, ...updatePreviews);
  }

  if (session.deleted.length > 0) {
    lines.push(`Deleted ${session.deleted.length} note(s).`);
  }

  if (session.goalsCreated.length > 0) {
    lines.push(`Goals created: ${session.goalsCreated.join(', ')}`);
  }

  if (lines.length === 0) {
    return 'Session ended — no notable memory changes.';
  }

  return ['Session ended — key changes:', ...lines].join('\n');
};

export const handleSessionStart = async (
  projectId: string,
  options: { previousFocus?: string } = {},
): Promise<{ bedsideNote: MemoryNote; briefing: string; evolvedNote?: MemoryNote }> => {
  const bedsideNote = await getOrCreateBedsideNote(projectId);

  let evolvedNote: MemoryNote | undefined;

  if (!eventCooldownHit(lastSessionStart, projectId) && options.previousFocus?.trim()) {
    const reminderText = options.previousFocus.trim();
    const updatedPlan = `Session start — remember: ${reminderText}\n\n${bedsideNote.text}`;
    evolvedNote = await evolveBedsideNote(projectId, updatedPlan, {
      changeReason: 'session_start',
    });
  }

  return {
    bedsideNote,
    briefing: `Bedside note briefing:\n${bedsideNote.text}`,
    evolvedNote,
  };
};

export const handleSessionEnd = async (projectId: string): Promise<MemoryNote> => {
  if (eventCooldownHit(lastSessionEnd, projectId)) {
    return getOrCreateBedsideNote(projectId);
  }

  const summary = formatSessionSummary();
  return evolveBedsideNote(projectId, summary, { changeReason: 'session_boundary' });
};

// Test hook to reset internal debounce state
export const __resetSessionLifecycleState = (): void => {
  lastSessionStart.clear();
  lastSessionEnd.clear();
};

export const __getSessionLifecycleDebounceMs = (): number => SESSION_EVENT_DEBOUNCE_MS;
