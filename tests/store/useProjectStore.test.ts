import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock the store since this test needs the real implementation
vi.unmock('@/features/project/store/useProjectStore');

import { useProjectStore } from '@/features/project/store/useProjectStore';
import { db } from '@/services/db';
import { seedProjectBedsideNoteFromAuthor } from '@/services/memory/chains';

// Mock the database
vi.mock('@/services/db', () => ({
  db: {
    projects: {
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([]))
        }))
      })),
      get: vi.fn(() => Promise.resolve(null)),
      add: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      bulkPut: vi.fn(() => Promise.resolve()),
    },
    chapters: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([]))
        }))
      })),
      add: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
      bulkAdd: vi.fn(() => Promise.resolve()),
      bulkPut: vi.fn(() => Promise.resolve()),
      get: vi.fn(() => Promise.resolve(null)),
    }
  }
}));

// Mock manuscriptIndexer
vi.mock('@/services/manuscriptIndexer', () => ({
  createEmptyIndex: vi.fn(() => ({
    characters: {},
    lastUpdated: {},
  }))
}));

vi.mock('@/services/memory/chains', () => ({
  seedProjectBedsideNoteFromAuthor: vi.fn(() => Promise.resolve()),
}));

describe('useProjectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the store before each test
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      chapters: [],
      activeChapterId: null,
      isLoading: false,
    });
  });

  describe('initial state', () => {
    it('starts with empty state', () => {
      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
      expect(state.currentProject).toBeNull();
      expect(state.chapters).toEqual([]);
      expect(state.activeChapterId).toBeNull();
    });
  });

  describe('selectChapter', () => {
    it('updates activeChapterId', () => {
      const { selectChapter } = useProjectStore.getState();
      selectChapter('test-chapter-id');
      
      expect(useProjectStore.getState().activeChapterId).toBe('test-chapter-id');
    });
  });

  describe('getActiveChapter', () => {
    it('returns undefined when no active chapter', () => {
      const { getActiveChapter } = useProjectStore.getState();
      expect(getActiveChapter()).toBeUndefined();
    });

    it('returns the active chapter when set', () => {
      const testChapter = {
        id: 'chapter-1',
        projectId: 'project-1',
        title: 'Test Chapter',
        content: 'Test content',
        order: 0,
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        chapters: [testChapter],
        activeChapterId: 'chapter-1',
      });

      const { getActiveChapter } = useProjectStore.getState();
      const active = getActiveChapter();
      
      expect(active?.title).toBe('Test Chapter');
      expect(active?.content).toBe('Test content');
    });
  });

  describe('chapter state updates', () => {
    it('updates chapter content in local state', async () => {
      const testChapter = {
        id: 'chapter-1',
        projectId: 'project-1',
        title: 'Test Chapter',
        content: 'Original content',
        order: 0,
        updatedAt: Date.now(),
      };

      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        currentProject: testProject,
        chapters: [testChapter],
        activeChapterId: 'chapter-1',
      });

      const { updateChapterContent } = useProjectStore.getState();
      await updateChapterContent('chapter-1', 'Updated content');

      const updated = useProjectStore.getState().chapters[0];
      expect(updated.content).toBe('Updated content');
    });

    it('updates chapter title in local state', async () => {
      const testChapter = {
        id: 'chapter-1',
        projectId: 'project-1',
        title: 'Original Title',
        content: 'Content',
        order: 0,
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        chapters: [testChapter],
        activeChapterId: 'chapter-1',
      });

      const { updateChapterTitle } = useProjectStore.getState();
      await updateChapterTitle('chapter-1', 'New Title');

      const updated = useProjectStore.getState().chapters[0];
      expect(updated.title).toBe('New Title');
    });
  });

  describe('deleteChapter', () => {
    it('removes chapter and updates active', async () => {
      const chapters = [
        { id: 'chapter-1', projectId: 'p1', title: 'Ch 1', content: '', order: 0, updatedAt: 0 },
        { id: 'chapter-2', projectId: 'p1', title: 'Ch 2', content: '', order: 1, updatedAt: 0 },
      ];

      useProjectStore.setState({
        chapters,
        activeChapterId: 'chapter-1',
      });

      const { deleteChapter } = useProjectStore.getState();
      await deleteChapter('chapter-1');

      const state = useProjectStore.getState();
      expect(state.chapters).toHaveLength(1);
      expect(state.chapters[0].id).toBe('chapter-2');
      expect(state.activeChapterId).toBe('chapter-2');
    });

    it('sets activeChapterId to null when deleting last chapter', async () => {
      const chapters = [
        { id: 'chapter-1', projectId: 'p1', title: 'Ch 1', content: '', order: 0, updatedAt: 0 },
      ];

      useProjectStore.setState({
        chapters,
        activeChapterId: 'chapter-1',
      });

      const { deleteChapter } = useProjectStore.getState();
      await deleteChapter('chapter-1');

      const state = useProjectStore.getState();
      expect(state.chapters).toHaveLength(0);
      expect(state.activeChapterId).toBeNull();
    });

    it('keeps activeChapterId unchanged when deleting non-active chapter', async () => {
      const chapters = [
        { id: 'chapter-1', projectId: 'p1', title: 'Ch 1', content: '', order: 0, updatedAt: 0 },
        { id: 'chapter-2', projectId: 'p1', title: 'Ch 2', content: '', order: 1, updatedAt: 0 },
      ];

      useProjectStore.setState({
        chapters,
        activeChapterId: 'chapter-1',
      });

      const { deleteChapter } = useProjectStore.getState();
      await deleteChapter('chapter-2');

      const state = useProjectStore.getState();
      expect(state.chapters).toHaveLength(1);
      expect(state.activeChapterId).toBe('chapter-1');
    });
  });

  describe('createChapter', () => {
    it('creates a new chapter and sets it active', async () => {
      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        currentProject: testProject,
        chapters: [],
      });

      const { createChapter } = useProjectStore.getState();
      const newId = await createChapter('My New Chapter');

      const state = useProjectStore.getState();
      expect(newId).toBeDefined();
      expect(state.chapters).toHaveLength(1);
      expect(state.chapters[0].title).toBe('My New Chapter');
      expect(state.activeChapterId).toBe(newId);
    });

    it('auto-generates chapter title if not provided', async () => {
      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        currentProject: testProject,
        chapters: [],
      });

      const { createChapter } = useProjectStore.getState();
      await createChapter();

      const state = useProjectStore.getState();
      expect(state.chapters[0].title).toBe('Chapter 1');
    });

    it('returns empty string if no project loaded', async () => {
      useProjectStore.setState({
        currentProject: null,
        chapters: [],
      });

      const { createChapter } = useProjectStore.getState();
      const result = await createChapter();

      expect(result).toBe('');
    });

    it('calculates correct order for new chapters', async () => {
      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const existingChapters = [
        { id: 'ch-1', projectId: 'project-1', title: 'Ch 1', content: '', order: 0, updatedAt: 0 },
        { id: 'ch-2', projectId: 'project-1', title: 'Ch 2', content: '', order: 1, updatedAt: 0 },
      ];

      useProjectStore.setState({
        currentProject: testProject,
        chapters: existingChapters,
      });

      const { createChapter } = useProjectStore.getState();
      await createChapter('Chapter 3');

      const state = useProjectStore.getState();
      expect(state.chapters).toHaveLength(3);
      expect(state.chapters[2].order).toBe(2);
    });
  });

  describe('reorderChapters', () => {
    it('updates chapter order in state', async () => {
      const chapters = [
        { id: 'ch-1', projectId: 'p1', title: 'Ch 1', content: '', order: 0, updatedAt: 0 },
        { id: 'ch-2', projectId: 'p1', title: 'Ch 2', content: '', order: 1, updatedAt: 0 },
        { id: 'ch-3', projectId: 'p1', title: 'Ch 3', content: '', order: 2, updatedAt: 0 },
      ];

      useProjectStore.setState({ chapters });

      const reordered = [chapters[2], chapters[0], chapters[1]]; // 3, 1, 2
      const { reorderChapters } = useProjectStore.getState();
      await reorderChapters(reordered);

      const state = useProjectStore.getState();
      expect(state.chapters[0].id).toBe('ch-3');
      expect(state.chapters[1].id).toBe('ch-1');
      expect(state.chapters[2].id).toBe('ch-2');
    });

    it('syncs order metadata and project timestamp when reordering', async () => {
      const baseChapter = { projectId: 'p1', content: '', updatedAt: 0 };
      const chapters = [
        { id: 'ch-1', title: 'Ch 1', order: 0, ...baseChapter },
        { id: 'ch-2', title: 'Ch 2', order: 1, ...baseChapter },
        { id: 'ch-3', title: 'Ch 3', order: 2, ...baseChapter },
      ];

      const project = {
        id: 'p1',
        title: 'Test',
        author: 'Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: 0,
        updatedAt: 0,
      };

      useProjectStore.setState({ chapters, currentProject: project });

      const reordered = [chapters[1], chapters[2], chapters[0]]; // 2,3,1
      const { reorderChapters } = useProjectStore.getState();
      await reorderChapters(reordered);

      const state = useProjectStore.getState();
      const updatedTimestamp = state.chapters[0].updatedAt;

      expect(state.chapters.map((c) => c.order)).toEqual([0, 1, 2]);
      expect(state.chapters.every((c) => c.updatedAt === updatedTimestamp)).toBe(true);

      expect(db.chapters.bulkPut).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'ch-2', order: 0, updatedAt: updatedTimestamp }),
          expect.objectContaining({ id: 'ch-3', order: 1, updatedAt: updatedTimestamp }),
          expect.objectContaining({ id: 'ch-1', order: 2, updatedAt: updatedTimestamp }),
        ]),
      );

      expect(db.projects.update).toHaveBeenCalledWith('p1', { updatedAt: updatedTimestamp });
    });
  });

  describe('updateChapterAnalysis', () => {
    it('stores analysis result on chapter', async () => {
      const testChapter = {
        id: 'chapter-1',
        projectId: 'project-1',
        title: 'Test Chapter',
        content: 'Test content',
        order: 0,
        updatedAt: Date.now(),
      };

      useProjectStore.setState({ chapters: [testChapter] });

      const mockAnalysis = {
        summary: 'Great chapter',
        strengths: ['Good pacing'],
        weaknesses: [],
        pacing: { score: 8, analysis: 'Well paced', slowSections: [], fastSections: [] },
        plotIssues: [],
        characters: [],
        generalSuggestions: [],
      };

      const { updateChapterAnalysis } = useProjectStore.getState();
      await updateChapterAnalysis('chapter-1', mockAnalysis);

      const state = useProjectStore.getState();
      expect(state.chapters[0].lastAnalysis).toEqual(mockAnalysis);
    });
  });

  describe('updateProjectLore', () => {
    it('updates lore on current project and projects list', async () => {
      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        currentProject: testProject,
        projects: [testProject],
      });

      const newLore = {
        characters: [{ name: 'Hero', bio: 'Main character' }],
        worldRules: ['Magic is real'],
      };

      const { updateProjectLore } = useProjectStore.getState();
      await updateProjectLore('project-1', newLore as any);

      const state = useProjectStore.getState();
      expect(state.currentProject?.lore).toEqual(newLore);
      expect(state.projects[0].lore).toEqual(newLore);
    });

    it('does not update if project ID does not match', async () => {
      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        currentProject: testProject,
        projects: [testProject],
      });

      const newLore = { characters: [], worldRules: [] };
      const { updateProjectLore } = useProjectStore.getState();
      await updateProjectLore('different-project', newLore as any);

      const state = useProjectStore.getState();
      expect(state.currentProject?.lore).toBeUndefined();
    });
  });

  describe('updateManuscriptIndex', () => {
    it('updates manuscript index on project', async () => {
      const testProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Test Author',
        manuscriptIndex: { characters: {}, lastUpdated: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useProjectStore.setState({
        currentProject: testProject,
        projects: [testProject],
      });

      const newIndex = {
        characters: {
          'John': {
            name: 'John',
            firstMention: { chapterId: '1', position: 0 },
            mentions: [],
            attributes: {},
          },
        },
        lastUpdated: { '1': Date.now() },
      };

      const { updateManuscriptIndex } = useProjectStore.getState();
      await updateManuscriptIndex('project-1', newIndex as any);

      const state = useProjectStore.getState();
      expect(state.currentProject?.manuscriptIndex).toEqual(newIndex);
      expect(state.projects[0].manuscriptIndex).toEqual(newIndex);
    });
  });

  describe('init', () => {
    it('loads projects from database', async () => {
      const { db } = await import('@/services/db');
      const mockProjects = [
        { id: 'p1', title: 'Project 1', author: 'Author', createdAt: 1000, updatedAt: 2000, manuscriptIndex: { characters: {}, lastUpdated: {} } },
      ];

      vi.mocked(db.projects.orderBy).mockReturnValue({
        reverse: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockProjects),
        }),
      } as any);

      vi.mocked(db.projects.get).mockResolvedValue(mockProjects[0] as any);
      vi.mocked(db.chapters.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([]),
        }),
      } as any);
      vi.mocked(db.chapters.add).mockResolvedValue(undefined);

      const { init } = useProjectStore.getState();
      await init();

      const state = useProjectStore.getState();
      expect(state.projects).toEqual(mockProjects);
      // Note: init starts loadProject but doesn't await it, so isLoading may still be true
      // The main assertion is that projects are loaded into state
    });

    it('handles empty projects list', async () => {
      const { db } = await import('@/services/db');
      
      vi.mocked(db.projects.orderBy).mockReturnValue({
        reverse: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { init } = useProjectStore.getState();
      await init();

      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
      expect(state.isLoading).toBe(false); // No loadProject called, so isLoading is set to false
    });
  });

  describe('createProject', () => {
    it('creates a new project and loads it', async () => {
      const { db } = await import('@/services/db');
      
      vi.mocked(db.projects.add).mockResolvedValue(undefined);
      vi.mocked(db.projects.get).mockResolvedValue({
        id: 'new-project-id',
        title: 'New Project',
        author: 'Author',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        manuscriptIndex: { characters: {}, lastUpdated: {} },
      } as any);
      vi.mocked(db.chapters.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createProject } = useProjectStore.getState();
      const projectId = await createProject('New Project', 'Author');

      expect(projectId).toBeDefined();
      expect(db.projects.add).toHaveBeenCalled();
      expect(seedProjectBedsideNoteFromAuthor).toHaveBeenCalledWith(projectId);
    });

    it('creates project with setting information', async () => {
      const { db } = await import('@/services/db');
      
      // Clear mocks from previous test
      vi.mocked(db.projects.add).mockClear();
      vi.mocked(db.projects.add).mockResolvedValue(undefined);
      vi.mocked(db.projects.get).mockResolvedValue({
        id: 'new-project-id',
        title: 'Historical Novel',
        author: 'Author',
        setting: { timePeriod: 'Victorian', location: 'London' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        manuscriptIndex: { characters: {}, lastUpdated: {} },
      } as any);
      vi.mocked(db.chapters.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([]),
        }),
      } as any);
      vi.mocked(db.chapters.add).mockResolvedValue(undefined);

      const { createProject } = useProjectStore.getState();
      await createProject('Historical Novel', 'Author', { timePeriod: 'Victorian', location: 'London' });

      const addCall = vi.mocked(db.projects.add).mock.calls[0][0] as any;
      expect(addCall.setting).toEqual({ timePeriod: 'Victorian', location: 'London' });
    });
  });

  describe('importProject', () => {
    it('imports project with chapters', async () => {
      const { db } = await import('@/services/db');
      
      vi.mocked(db.projects.add).mockResolvedValue(undefined);
      vi.mocked(db.chapters.bulkAdd).mockResolvedValue(undefined);

      const parsedChapters = [
        { title: 'Chapter 1', content: 'Content 1' },
        { title: 'Chapter 2', content: 'Content 2' },
      ];

      const { importProject } = useProjectStore.getState();
      const projectId = await importProject('Imported Book', parsedChapters);

      expect(projectId).toBeDefined();
      expect(db.projects.add).toHaveBeenCalled();
      expect(db.chapters.bulkAdd).toHaveBeenCalled();

      const state = useProjectStore.getState();
      expect(state.chapters).toHaveLength(2);
      expect(state.chapters[0].title).toBe('Chapter 1');
      expect(state.chapters[1].title).toBe('Chapter 2');
    });

    it('selects first chapter as active after import', async () => {
      const { db } = await import('@/services/db');
      
      vi.mocked(db.projects.add).mockResolvedValue(undefined);
      vi.mocked(db.chapters.bulkAdd).mockResolvedValue(undefined);

      const parsedChapters = [
        { title: 'Chapter 1', content: 'Content 1' },
      ];

      const { importProject } = useProjectStore.getState();
      await importProject('Imported Book', parsedChapters);

      const state = useProjectStore.getState();
      expect(state.activeChapterId).toBe(state.chapters[0].id);
    });
  });

  describe('loadProject', () => {
    it('loads project and chapters from database', async () => {
      const { db } = await import('@/services/db');
      
      const mockProject = {
        id: 'project-1',
        title: 'Test Project',
        author: 'Author',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        manuscriptIndex: { characters: {}, lastUpdated: {} },
      };

      const mockChapters = [
        { id: 'ch-1', projectId: 'project-1', title: 'Chapter 1', content: '', order: 0, updatedAt: 0 },
      ];

      vi.mocked(db.projects.get).mockResolvedValue(mockProject as any);
      vi.mocked(db.chapters.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue(mockChapters),
        }),
      } as any);

      const { loadProject } = useProjectStore.getState();
      await loadProject('project-1');

      const state = useProjectStore.getState();
      expect(state.currentProject?.id).toBe('project-1');
      expect(state.chapters).toHaveLength(1);
      expect(state.activeChapterId).toBe('ch-1');
      expect(state.isLoading).toBe(false);
    });

    it('creates first chapter if project has none', async () => {
      const { db } = await import('@/services/db');
      
      const mockProject = {
        id: 'project-1',
        title: 'Empty Project',
        author: 'Author',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        manuscriptIndex: { characters: {}, lastUpdated: {} },
      };

      vi.mocked(db.projects.get).mockResolvedValue(mockProject as any);
      vi.mocked(db.chapters.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([]),
        }),
      } as any);
      vi.mocked(db.chapters.add).mockResolvedValue(undefined);

      const { loadProject } = useProjectStore.getState();
      await loadProject('project-1');

      expect(db.chapters.add).toHaveBeenCalled();
      const state = useProjectStore.getState();
      expect(state.chapters).toHaveLength(1);
      expect(state.chapters[0].title).toBe('Chapter 1');
    });

    it('handles non-existent project gracefully', async () => {
      const { db } = await import('@/services/db');
      
      vi.mocked(db.projects.get).mockResolvedValue(null);

      const { loadProject } = useProjectStore.getState();
      await loadProject('non-existent');

      const state = useProjectStore.getState();
      expect(state.currentProject).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });
});
