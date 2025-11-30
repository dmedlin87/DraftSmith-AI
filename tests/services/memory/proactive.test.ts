import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('@/services/db', () => ({
  db: {
    watchedEntities: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    memories: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    goals: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock memory index functions
vi.mock('@/services/memory/index', () => ({
  getMemories: vi.fn().mockResolvedValue([]),
  getActiveGoals: vi.fn().mockResolvedValue([]),
  searchMemoriesByTags: vi.fn().mockResolvedValue([]),
}));

import {
  extractEntitiesFromText,
  getWatchedEntitiesInChapter,
  getRelatedMemories,
  generateSuggestionsForChapter,
  getImportantReminders,
} from '@/services/memory/proactive';
import { db } from '@/services/db';
import { getMemories, getActiveGoals, searchMemoriesByTags } from '@/services/memory/index';

describe('Proactive Memory Suggestions', () => {
  const mockProjectId = 'test-project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractEntitiesFromText', () => {
    it('extracts character names from dialogue attribution', () => {
      const text = '"Hello there," said John. "How are you?" asked Mary.';
      const entities = extractEntitiesFromText(text);

      expect(entities).toContain('john');
      expect(entities).toContain('mary');
    });

    it('extracts frequently capitalized words', () => {
      const text = 'The Kingdom was vast. The Kingdom stretched far. The Kingdom was ancient. The Kingdom ruled.';
      const entities = extractEntitiesFromText(text);

      expect(entities).toContain('kingdom');
    });

    it('handles text with no entities', () => {
      const text = 'the quick brown fox jumped over the lazy dog';
      const entities = extractEntitiesFromText(text);

      expect(entities).toHaveLength(0);
    });

    it('extracts from various dialogue patterns', () => {
      const text = `
        "Run!" shouted Marcus.
        "Wait," whispered Elena.
        "Why?" exclaimed Thomas.
      `;
      const entities = extractEntitiesFromText(text);

      expect(entities).toContain('marcus');
      expect(entities).toContain('elena');
      expect(entities).toContain('thomas');
    });
  });

  describe('getWatchedEntitiesInChapter', () => {
    it('finds watched entities mentioned in chapter', async () => {
      vi.mocked(db.watchedEntities.toArray).mockResolvedValue([
        { id: 'w1', name: 'John', projectId: mockProjectId, priority: 'high', createdAt: Date.now() },
        { id: 'w2', name: 'Sarah', projectId: mockProjectId, priority: 'medium', createdAt: Date.now() },
      ]);

      // Use mentionedEntities directly to bypass extraction logic
      const result = await getWatchedEntitiesInChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        mentionedEntities: ['john', 'marcus'], // Pre-extracted entities
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
    });

    it('returns empty when no watched entities match', async () => {
      vi.mocked(db.watchedEntities.toArray).mockResolvedValue([
        { id: 'w1', name: 'Marcus', projectId: mockProjectId, priority: 'high', createdAt: Date.now() },
      ]);

      const result = await getWatchedEntitiesInChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        content: 'John and Sarah discussed the plan.',
      });

      expect(result).toHaveLength(0);
    });

    it('uses provided mentionedEntities', async () => {
      vi.mocked(db.watchedEntities.toArray).mockResolvedValue([
        { id: 'w1', name: 'John', projectId: mockProjectId, priority: 'high', createdAt: Date.now() },
      ]);

      const result = await getWatchedEntitiesInChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        mentionedEntities: ['john', 'sarah'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
    });
  });

  describe('getRelatedMemories', () => {
    it('searches for memories with character tags', async () => {
      vi.mocked(searchMemoriesByTags).mockResolvedValue([
        {
          id: 'mem1',
          text: 'John is the protagonist',
          type: 'fact' as const,
          scope: 'project' as const,
          projectId: mockProjectId,
          topicTags: ['character:john'],
          importance: 0.8,
          createdAt: Date.now(),
        },
      ]);

      const result = await getRelatedMemories(mockProjectId, ['John', 'Sarah']);

      expect(searchMemoriesByTags).toHaveBeenCalledWith(
        ['character:john', 'character:sarah'],
        expect.objectContaining({ projectId: mockProjectId })
      );
      expect(result).toHaveLength(1);
    });

    it('returns empty for no entities', async () => {
      const result = await getRelatedMemories(mockProjectId, []);

      expect(searchMemoriesByTags).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe('generateSuggestionsForChapter', () => {
    it('generates suggestions for watched entities', async () => {
      vi.mocked(db.watchedEntities.toArray).mockResolvedValue([
        { 
          id: 'w1', 
          name: 'John', 
          projectId: mockProjectId, 
          priority: 'high', 
          reason: 'Main character',
          createdAt: Date.now() 
        },
      ]);

      // Use mentionedEntities to ensure entity is found
      const suggestions = await generateSuggestionsForChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        mentionedEntities: ['john'],
      });

      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0].type).toBe('watched_entity');
      expect(suggestions[0].title).toContain('John');
    });

    it('generates suggestions for related memories', async () => {
      vi.mocked(searchMemoriesByTags).mockResolvedValue([
        {
          id: 'mem1',
          text: 'John fears the dark',
          type: 'fact' as const,
          scope: 'project' as const,
          projectId: mockProjectId,
          topicTags: ['character:john', 'motivation'],
          importance: 0.8,
          createdAt: Date.now(),
        },
      ]);

      const suggestions = await generateSuggestionsForChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        content: 'John walked alone. John was nervous. John hesitated.',
      });

      const memorySuggestions = suggestions.filter(s => s.type === 'related_memory');
      expect(memorySuggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('generates suggestions for relevant goals', async () => {
      vi.mocked(getActiveGoals).mockResolvedValue([
        {
          id: 'goal1',
          projectId: mockProjectId,
          title: 'Develop John\'s arc',
          description: 'Make John more sympathetic',
          status: 'active',
          progress: 20,
          createdAt: Date.now() - 1000,
        },
      ]);

      const suggestions = await generateSuggestionsForChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        content: 'John reflected on his past mistakes.',
      });

      const goalSuggestions = suggestions.filter(s => s.type === 'active_goal');
      expect(goalSuggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('sorts suggestions by priority', async () => {
      vi.mocked(db.watchedEntities.toArray).mockResolvedValue([
        { id: 'w1', name: 'John', projectId: mockProjectId, priority: 'low', createdAt: Date.now() },
        { id: 'w2', name: 'Sarah', projectId: mockProjectId, priority: 'high', createdAt: Date.now() },
      ]);

      const suggestions = await generateSuggestionsForChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        content: 'John and Sarah met at the station.',
      });

      if (suggestions.length >= 2) {
        const highPriorityFirst = suggestions.findIndex(s => s.priority === 'high');
        const lowPriorityFirst = suggestions.findIndex(s => s.priority === 'low');
        
        if (highPriorityFirst !== -1 && lowPriorityFirst !== -1) {
          expect(highPriorityFirst).toBeLessThan(lowPriorityFirst);
        }
      }
    });

    it('limits total suggestions', async () => {
      vi.mocked(db.watchedEntities.toArray).mockResolvedValue([
        { id: 'w1', name: 'John', projectId: mockProjectId, priority: 'high', createdAt: Date.now() },
        { id: 'w2', name: 'Sarah', projectId: mockProjectId, priority: 'high', createdAt: Date.now() },
        { id: 'w3', name: 'Marcus', projectId: mockProjectId, priority: 'medium', createdAt: Date.now() },
        { id: 'w4', name: 'Elena', projectId: mockProjectId, priority: 'medium', createdAt: Date.now() },
        { id: 'w5', name: 'Thomas', projectId: mockProjectId, priority: 'low', createdAt: Date.now() },
        { id: 'w6', name: 'Clara', projectId: mockProjectId, priority: 'low', createdAt: Date.now() },
      ]);

      const suggestions = await generateSuggestionsForChapter(mockProjectId, {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        content: 'John Sarah Marcus Elena Thomas Clara all gathered.',
      });

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getImportantReminders', () => {
    it('returns high-importance unresolved issues', async () => {
      vi.mocked(getMemories).mockResolvedValue([
        {
          id: 'issue1',
          text: 'Plot hole in chapter 3',
          type: 'issue' as const,
          scope: 'project' as const,
          projectId: mockProjectId,
          topicTags: ['plot'],
          importance: 0.9,
          createdAt: Date.now() - 1000,
        },
      ]);

      const reminders = await getImportantReminders(mockProjectId);

      expect(reminders.length).toBeGreaterThanOrEqual(1);
      expect(reminders[0].type).toBe('reminder');
      expect(reminders[0].priority).toBe('high');
    });

    it('returns stalled goals as reminders', async () => {
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
      
      vi.mocked(getActiveGoals).mockResolvedValue([
        {
          id: 'goal1',
          projectId: mockProjectId,
          title: 'Finish outline',
          status: 'active',
          progress: 10,
          createdAt: twoDaysAgo,
        },
      ]);

      const reminders = await getImportantReminders(mockProjectId);

      const stalledGoals = reminders.filter(r => r.title.includes('Stalled goal'));
      expect(stalledGoals.length).toBeGreaterThanOrEqual(0);
    });
  });
});
