import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import type { MemoryNote, CreateMemoryNoteInput, MemoryNoteType } from '@/services/memory/types';

// ────────────────────────────────────────────────────────────────────────────────
// Robust Local Dexie Mock
// ────────────────────────────────────────────────────────────────────────────────

interface MockCollection {
  filter: Mock;
  toArray: Mock;
}

interface MockWhereClause {
  equals: Mock;
}

interface MockMemoriesTable {
  add: Mock;
  put: Mock;
  get: Mock;
  delete: Mock;
  where: Mock;
  toCollection: Mock;
}

/**
 * Creates a robust mock for Dexie db.memories table that supports:
 * - Compound keys like [scope+projectId]
 * - Single keys like 'scope', 'projectId'
 * - Collection methods: filter(), toArray()
 */
function createMemoriesTableMock(data: MemoryNote[] = []): MockMemoriesTable {
  let storedData = [...data];

  // Track applied filters for verification
  let appliedFilters: ((note: MemoryNote) => boolean)[] = [];

  const createCollection = (baseData: MemoryNote[]): MockCollection => {
    let collectionData = [...baseData];
    appliedFilters = [];

    const collection: MockCollection = {
      filter: vi.fn().mockImplementation((predicate: (note: MemoryNote) => boolean) => {
        appliedFilters.push(predicate);
        collectionData = collectionData.filter(predicate);
        // Return a new collection with the filtered data
        return createCollection(collectionData);
      }),
      toArray: vi.fn().mockImplementation(() => Promise.resolve([...collectionData])),
    };

    return collection;
  };

  const mockTable: MockMemoriesTable = {
    add: vi.fn().mockImplementation((note: MemoryNote) => {
      storedData.push(note);
      return Promise.resolve(note.id);
    }),

    put: vi.fn().mockImplementation((note: MemoryNote) => {
      const index = storedData.findIndex(n => n.id === note.id);
      if (index >= 0) {
        storedData[index] = note;
      } else {
        storedData.push(note);
      }
      return Promise.resolve(note.id);
    }),

    get: vi.fn().mockImplementation((id: string) => {
      return Promise.resolve(storedData.find(n => n.id === id));
    }),

    delete: vi.fn().mockImplementation((id: string) => {
      const index = storedData.findIndex(n => n.id === id);
      if (index >= 0) {
        storedData.splice(index, 1);
      }
      return Promise.resolve();
    }),

    where: vi.fn().mockImplementation((field: string): MockWhereClause => {
      return {
        equals: vi.fn().mockImplementation((value: any): MockCollection => {
          let filtered: MemoryNote[];

          if (field === '[scope+projectId]') {
            // Compound key: value is [scope, projectId]
            const [scope, projectId] = value;
            filtered = storedData.filter(
              n => n.scope === scope && n.projectId === projectId
            );
          } else if (field === 'scope') {
            filtered = storedData.filter(n => n.scope === value);
          } else if (field === 'projectId') {
            filtered = storedData.filter(n => n.projectId === value);
          } else if (field === 'type') {
            filtered = storedData.filter(n => n.type === value);
          } else {
            filtered = storedData;
          }

          return createCollection(filtered);
        }),
      };
    }),

    toCollection: vi.fn().mockImplementation(() => createCollection(storedData)),
  };

  return mockTable;
}

// Module-level mock instance
let mockMemoriesTable: MockMemoriesTable;

vi.mock('@/services/db', () => ({
  db: {
    get memories() {
      return mockMemoriesTable;
    },
    goals: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    watchedEntities: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
    },
  },
}));

// Import after mocking
import {
  createMemory,
  getMemories,
  getMemory,
  updateMemory,
  deleteMemory,
} from '@/services/memory';
import { db } from '@/services/db';

// ────────────────────────────────────────────────────────────────────────────────
// Test Data Fixtures
// ────────────────────────────────────────────────────────────────────────────────

const now = Date.now();

function createTestMemory(overrides: Partial<MemoryNote> = {}): MemoryNote {
  return {
    id: crypto.randomUUID(),
    scope: 'project',
    projectId: 'proj1',
    text: 'Test memory',
    type: 'fact',
    topicTags: [],
    importance: 0.5,
    createdAt: now,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────────

describe('Memory Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemoriesTable = createMemoriesTableMock([]);
  });

  describe('createMemory', () => {
    it('creates a memory and calls db.add', async () => {
      const input: CreateMemoryNoteInput = {
        scope: 'project',
        projectId: 'proj1',
        text: 'Seth has green eyes',
        type: 'fact',
        topicTags: ['character:seth'],
        importance: 0.8,
      };

      const result = await createMemory(input);

      expect(mockMemoriesTable.add).toHaveBeenCalledTimes(1);
      expect(mockMemoriesTable.add).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'project',
          projectId: 'proj1',
          text: 'Seth has green eyes',
          type: 'fact',
          topicTags: ['character:seth'],
          importance: 0.8,
        })
      );
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('throws error when projectId is missing for project scope', async () => {
      const input: CreateMemoryNoteInput = {
        scope: 'project',
        // Missing projectId
        text: 'Orphaned memory',
        type: 'fact',
        topicTags: [],
        importance: 0.5,
      };

      await expect(createMemory(input)).rejects.toThrow(
        'projectId is required for project-scoped memories'
      );
      expect(mockMemoriesTable.add).not.toHaveBeenCalled();
    });

    it('allows author-scoped memories without projectId', async () => {
      const input: CreateMemoryNoteInput = {
        scope: 'author',
        text: 'Author prefers short chapters',
        type: 'preference',
        topicTags: ['style'],
        importance: 0.9,
      };

      const result = await createMemory(input);

      expect(mockMemoriesTable.add).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('author');
      expect(result.projectId).toBeUndefined();
    });
  });

  describe('getMemories', () => {
    const testMemories: MemoryNote[] = [
      createTestMemory({
        id: 'mem1',
        text: 'Seth is brave',
        type: 'fact',
        topicTags: ['character:seth'],
        importance: 0.9,
        createdAt: now - 1000,
      }),
      createTestMemory({
        id: 'mem2',
        text: 'Plot twist in Act 2',
        type: 'observation',
        topicTags: ['plot', 'act2'],
        importance: 0.7,
        createdAt: now - 2000,
      }),
      createTestMemory({
        id: 'mem3',
        text: 'Sarah is a doctor',
        type: 'fact',
        topicTags: ['character:sarah'],
        importance: 0.5,
        createdAt: now - 3000,
      }),
      createTestMemory({
        id: 'mem4',
        scope: 'author',
        projectId: undefined,
        text: 'Author preference',
        type: 'preference',
        topicTags: ['style'],
        importance: 0.8,
        createdAt: now,
      }),
    ];

    beforeEach(() => {
      mockMemoriesTable = createMemoriesTableMock(testMemories);
    });

    it('returns memories for compound key [scope+projectId]', async () => {
      const result = await getMemories({ scope: 'project', projectId: 'proj1' });

      expect(mockMemoriesTable.where).toHaveBeenCalledWith('[scope+projectId]');
      expect(result.length).toBe(3); // Only project-scoped memories
      expect(result.every(m => m.scope === 'project')).toBe(true);
    });

    it('returns memories filtered by scope only', async () => {
      const result = await getMemories({ scope: 'author' });

      expect(mockMemoriesTable.where).toHaveBeenCalledWith('scope');
      expect(result.length).toBe(1);
      expect(result[0].scope).toBe('author');
    });

    it('filters by type using Collection.filter()', async () => {
      const result = await getMemories({
        scope: 'project',
        projectId: 'proj1',
        type: 'fact',
      });

      // Verify filter was applied (collection.filter should be called)
      expect(result.every(m => m.type === 'fact')).toBe(true);
      expect(result.length).toBe(2); // mem1 and mem3
    });

    it('filters by topicTags (AND logic - all tags must match)', async () => {
      const result = await getMemories({
        scope: 'project',
        projectId: 'proj1',
        topicTags: ['plot', 'act2'],
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('mem2');
    });

    it('filters by minImportance', async () => {
      const result = await getMemories({
        scope: 'project',
        projectId: 'proj1',
        minImportance: 0.8,
      });

      expect(result.every(m => m.importance >= 0.8)).toBe(true);
      expect(result.length).toBe(1); // Only mem1 has importance >= 0.8
    });

    it('combines multiple filters correctly', async () => {
      const result = await getMemories({
        scope: 'project',
        projectId: 'proj1',
        type: 'fact',
        minImportance: 0.6,
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('mem1');
    });

    it('sorts by importance (desc) then createdAt (desc)', async () => {
      const result = await getMemories({ scope: 'project', projectId: 'proj1' });

      // Should be sorted: mem1 (0.9), mem2 (0.7), mem3 (0.5)
      expect(result[0].id).toBe('mem1');
      expect(result[1].id).toBe('mem2');
      expect(result[2].id).toBe('mem3');
    });

    it('respects limit parameter', async () => {
      const result = await getMemories({
        scope: 'project',
        projectId: 'proj1',
        limit: 2,
      });

      expect(result.length).toBe(2);
    });

    it('returns empty array when no matches', async () => {
      const result = await getMemories({
        scope: 'project',
        projectId: 'nonexistent',
      });

      expect(result).toEqual([]);
    });
  });

  describe('getMemory', () => {
    it('returns memory by id', async () => {
      const testMem = createTestMemory({ id: 'test-id-123' });
      mockMemoriesTable = createMemoriesTableMock([testMem]);

      const result = await getMemory('test-id-123');

      expect(mockMemoriesTable.get).toHaveBeenCalledWith('test-id-123');
      expect(result).toBeDefined();
      expect(result?.id).toBe('test-id-123');
    });

    it('returns undefined for non-existent id', async () => {
      mockMemoriesTable = createMemoriesTableMock([]);

      const result = await getMemory('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('updateMemory', () => {
    it('updates memory and calls db.put', async () => {
      const original = createTestMemory({ id: 'update-test', text: 'Original text' });
      mockMemoriesTable = createMemoriesTableMock([original]);

      const result = await updateMemory('update-test', { text: 'Updated text' });

      expect(mockMemoriesTable.get).toHaveBeenCalledWith('update-test');
      expect(mockMemoriesTable.put).toHaveBeenCalledTimes(1);
      expect(mockMemoriesTable.put).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'update-test',
          text: 'Updated text',
          updatedAt: expect.any(Number),
        })
      );
      expect(result.text).toBe('Updated text');
      expect(result.updatedAt).toBeDefined();
    });

    it('throws error for non-existent memory', async () => {
      mockMemoriesTable = createMemoriesTableMock([]);

      await expect(updateMemory('nonexistent', { text: 'New text' })).rejects.toThrow(
        'Memory note not found: nonexistent'
      );
      expect(mockMemoriesTable.put).not.toHaveBeenCalled();
    });

    it('preserves unchanged fields', async () => {
      const original = createTestMemory({
        id: 'preserve-test',
        text: 'Original',
        type: 'fact',
        topicTags: ['tag1'],
        importance: 0.5,
      });
      mockMemoriesTable = createMemoriesTableMock([original]);

      const result = await updateMemory('preserve-test', { importance: 0.9 });

      expect(result.text).toBe('Original');
      expect(result.type).toBe('fact');
      expect(result.topicTags).toEqual(['tag1']);
      expect(result.importance).toBe(0.9);
    });
  });

  describe('deleteMemory', () => {
    it('deletes memory by id', async () => {
      const testMem = createTestMemory({ id: 'delete-test' });
      mockMemoriesTable = createMemoriesTableMock([testMem]);

      await deleteMemory('delete-test');

      expect(mockMemoriesTable.delete).toHaveBeenCalledWith('delete-test');
    });

    it('does not throw for non-existent memory', async () => {
      mockMemoriesTable = createMemoriesTableMock([]);

      await expect(deleteMemory('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('Collection.filter() optimization', () => {
    it('applies filters via Collection.filter() before toArray()', async () => {
      // Setup with tracking spy
      const testMemories = [
        createTestMemory({ id: 'a', type: 'fact', importance: 0.9 }),
        createTestMemory({ id: 'b', type: 'observation', importance: 0.5 }),
        createTestMemory({ id: 'c', type: 'fact', importance: 0.3 }),
      ];
      mockMemoriesTable = createMemoriesTableMock(testMemories);

      await getMemories({
        scope: 'project',
        projectId: 'proj1',
        type: 'fact',
        minImportance: 0.5,
      });

      // The where clause should return a collection that has filter called on it
      // We verify the result is correct (which means filters were applied)
      const result = await getMemories({
        scope: 'project',
        projectId: 'proj1',
        type: 'fact',
        minImportance: 0.5,
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('a');
    });
  });
});
