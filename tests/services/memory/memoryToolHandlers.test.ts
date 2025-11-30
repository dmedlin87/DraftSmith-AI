import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  isMemoryTool, 
  executeMemoryTool, 
  getMemoryToolNames,
} from '@/services/gemini/memoryToolHandlers';

// Mock the memory service
vi.mock('@/services/memory', () => ({
  createMemory: vi.fn().mockResolvedValue({
    id: 'mock-memory-id-12345',
    text: 'Test memory',
    type: 'observation',
    scope: 'project',
    projectId: 'test-project',
    topicTags: ['test'],
    importance: 0.5,
    createdAt: Date.now(),
  }),
  getMemories: vi.fn().mockResolvedValue([
    {
      id: 'mem-1',
      text: 'Existing memory 1',
      type: 'fact',
      scope: 'project',
      projectId: 'test-project',
      topicTags: ['character:john'],
      importance: 0.7,
      createdAt: Date.now() - 1000,
    },
    {
      id: 'mem-2',
      text: 'Existing memory 2',
      type: 'observation',
      scope: 'author',
      topicTags: ['style'],
      importance: 0.5,
      createdAt: Date.now(),
    },
  ]),
  updateMemory: vi.fn().mockResolvedValue({
    id: 'mem-1',
    text: 'Updated memory',
    type: 'fact',
    scope: 'project',
    projectId: 'test-project',
    topicTags: ['character:john', 'updated'],
    importance: 0.8,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
  }),
  deleteMemory: vi.fn().mockResolvedValue(undefined),
  addGoal: vi.fn().mockResolvedValue({
    id: 'goal-123',
    projectId: 'test-project',
    title: 'Test Goal',
    description: 'Test description',
    status: 'active',
    progress: 0,
    createdAt: Date.now(),
  }),
  updateGoal: vi.fn().mockResolvedValue({
    id: 'goal-123',
    projectId: 'test-project',
    title: 'Test Goal',
    description: 'Test description',
    status: 'active',
    progress: 50,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
  }),
  addWatchedEntity: vi.fn().mockResolvedValue({
    id: 'watch-123',
    projectId: 'test-project',
    name: 'John',
    priority: 'high',
    reason: 'Main character',
    createdAt: Date.now(),
  }),
}));

describe('memoryToolHandlers', () => {
  const mockContext = { projectId: 'test-project' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isMemoryTool', () => {
    it('returns true for valid memory tools', () => {
      expect(isMemoryTool('write_memory_note')).toBe(true);
      expect(isMemoryTool('search_memory')).toBe(true);
      expect(isMemoryTool('update_memory_note')).toBe(true);
      expect(isMemoryTool('delete_memory_note')).toBe(true);
      expect(isMemoryTool('create_goal')).toBe(true);
      expect(isMemoryTool('update_goal')).toBe(true);
      expect(isMemoryTool('watch_entity')).toBe(true);
    });

    it('returns false for non-memory tools', () => {
      expect(isMemoryTool('update_manuscript')).toBe(false);
      expect(isMemoryTool('navigate_to_text')).toBe(false);
      expect(isMemoryTool('unknown_tool')).toBe(false);
      expect(isMemoryTool('')).toBe(false);
    });
  });

  describe('getMemoryToolNames', () => {
    it('returns all memory tool names', () => {
      const names = getMemoryToolNames();
      expect(names).toContain('write_memory_note');
      expect(names).toContain('search_memory');
      expect(names).toContain('create_goal');
      expect(names).toContain('watch_entity');
      expect(names.length).toBe(7);
    });
  });

  describe('executeMemoryTool', () => {
    describe('write_memory_note', () => {
      it('creates a memory with required fields', async () => {
        const result = await executeMemoryTool('write_memory_note', {
          text: 'Test memory content',
          type: 'observation',
          scope: 'project',
          tags: ['test-tag'],
          importance: 0.7,
        }, mockContext);

        expect(result).toContain('✓ Memory saved');
        expect(result).toContain('observation');
      });

      it('returns error when required fields are missing', async () => {
        const result = await executeMemoryTool('write_memory_note', {
          text: 'Test',
          // missing type and scope
        }, mockContext);

        expect(result).toContain('Error');
        expect(result).toContain('Missing required fields');
      });
    });

    describe('search_memory', () => {
      it('searches memories and returns formatted results', async () => {
        const result = await executeMemoryTool('search_memory', {
          tags: ['character:john'],
          scope: 'all',
        }, mockContext);

        expect(result).toContain('Found');
        expect(result).toContain('memories');
      });

      it('handles empty search results', async () => {
        const { getMemories } = await import('@/services/memory');
        vi.mocked(getMemories).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        const result = await executeMemoryTool('search_memory', {
          tags: ['nonexistent'],
        }, mockContext);

        expect(result).toContain('No memories found');
      });
    });

    describe('update_memory_note', () => {
      it('updates memory with new values', async () => {
        const result = await executeMemoryTool('update_memory_note', {
          id: 'mem-1',
          text: 'Updated text',
          importance: 0.9,
        }, mockContext);

        expect(result).toContain('✓ Memory updated');
      });

      it('returns error when id is missing', async () => {
        const result = await executeMemoryTool('update_memory_note', {
          text: 'Updated text',
        }, mockContext);

        expect(result).toContain('Error');
        expect(result).toContain('Memory ID');
      });
    });

    describe('delete_memory_note', () => {
      it('deletes memory by id', async () => {
        const result = await executeMemoryTool('delete_memory_note', {
          id: 'mem-1',
        }, mockContext);

        expect(result).toContain('✓ Memory deleted');
      });

      it('returns error when id is missing', async () => {
        const result = await executeMemoryTool('delete_memory_note', {}, mockContext);

        expect(result).toContain('Error');
        expect(result).toContain('Memory ID');
      });
    });

    describe('create_goal', () => {
      it('creates a goal with title and description', async () => {
        const result = await executeMemoryTool('create_goal', {
          title: 'Fix character arc',
          description: 'Improve John\'s motivation',
        }, mockContext);

        expect(result).toContain('✓ Goal created');
        expect(result).toContain('Fix character arc');
      });

      it('returns error when title is missing', async () => {
        const result = await executeMemoryTool('create_goal', {
          description: 'Some description',
        }, mockContext);

        expect(result).toContain('Error');
        expect(result).toContain('title');
      });
    });

    describe('update_goal', () => {
      it('updates goal progress', async () => {
        const result = await executeMemoryTool('update_goal', {
          id: 'goal-123',
          progress: 50,
        }, mockContext);

        expect(result).toContain('✓ Goal updated');
        expect(result).toContain('50%');
      });

      it('updates goal status', async () => {
        const { updateGoal } = await import('@/services/memory');
        vi.mocked(updateGoal).mockResolvedValueOnce({
          id: 'goal-123',
          projectId: 'test-project',
          title: 'Test Goal',
          status: 'completed',
          progress: 100,
          createdAt: Date.now(),
        });

        const result = await executeMemoryTool('update_goal', {
          id: 'goal-123',
          status: 'completed',
          progress: 100,
        }, mockContext);

        expect(result).toContain('✓ Goal updated');
      });

      it('returns error when id is missing', async () => {
        const result = await executeMemoryTool('update_goal', {
          progress: 50,
        }, mockContext);

        expect(result).toContain('Error');
        expect(result).toContain('Goal ID');
      });
    });

    describe('watch_entity', () => {
      it('adds entity to watchlist', async () => {
        const result = await executeMemoryTool('watch_entity', {
          name: 'John',
          priority: 'high',
          reason: 'Main character needs attention',
        }, mockContext);

        expect(result).toContain('watching');
        expect(result).toContain('John');
      });

      it('returns error when name is missing', async () => {
        const result = await executeMemoryTool('watch_entity', {
          priority: 'high',
        }, mockContext);

        expect(result).toContain('Error');
        expect(result).toContain('name');
      });
    });

    describe('unknown tool', () => {
      it('returns null for unknown tools', async () => {
        const result = await executeMemoryTool('unknown_tool', {}, mockContext);
        expect(result).toBeNull();
      });
    });
  });
});
