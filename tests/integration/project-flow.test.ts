import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '@/features/project/store/useProjectStore';

const { projects, chapters, dbMock } = vi.hoisted(() => {
  const projects: any[] = [];
  const chapters: any[] = [];

  const dbMock = {
    projects: {
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          toArray: vi.fn(async () => [...projects])
        }))
      })),
      add: vi.fn(async (project: any) => {
        projects.push(project);
        return project.id;
      }),
      get: vi.fn(async (id: string) => projects.find(p => p.id === id) || null),
      update: vi.fn(async (id: string, changes: any) => {
        const index = projects.findIndex(p => p.id === id);
        if (index !== -1) {
          projects[index] = { ...projects[index], ...changes };
        }
      }),
    },
    chapters: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          sortBy: vi.fn(async () => [...chapters].sort((a, b) => a.order - b.order))
        }))
      })),
      add: vi.fn(async (chapter: any) => {
        chapters.push(chapter);
        return chapter.id;
      }),
      update: vi.fn(async (id: string, changes: any) => {
        const index = chapters.findIndex(c => c.id === id);
        if (index !== -1) {
          chapters[index] = { ...chapters[index], ...changes };
        }
      }),
      bulkPut: vi.fn(async (updated: any[]) => {
        updated.forEach(update => {
          const idx = chapters.findIndex(c => c.id === update.id);
          if (idx !== -1) {
            chapters[idx] = { ...chapters[idx], ...update };
          }
        });
      }),
      bulkAdd: vi.fn(),
      delete: vi.fn(),
    }
  };

  return { projects, chapters, dbMock };
});

vi.mock('@/services/db', () => ({ db: dbMock }));
vi.mock('@/services/manuscriptIndexer', () => ({ createEmptyIndex: vi.fn(() => ({ characters: {}, lastUpdated: {} })) }));

let uuidCounter = 0;

describe('Project flow integration', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) });
    projects.length = 0;
    chapters.length = 0;
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      chapters: [],
      activeChapterId: null,
      isLoading: false,
    });
  });

  it('creates a project, opens first chapter, and persists edits', async () => {
    const { createProject, getActiveChapter, updateChapterContent } = useProjectStore.getState();

    const projectId = await createProject('Integration Novel', 'Alice');

    const stateAfterCreate = useProjectStore.getState();
    expect(projectId).toBe('uuid-1');
    expect(stateAfterCreate.currentProject?.title).toBe('Integration Novel');
    expect(projects).toHaveLength(1);
    expect(chapters).toHaveLength(1);

    const activeChapter = getActiveChapter();
    expect(activeChapter?.title).toBe('Chapter 1');

    await updateChapterContent(activeChapter!.id, 'Updated draft content');

    const savedChapter = chapters.find(c => c.id === activeChapter!.id);
    expect(savedChapter?.content).toBe('Updated draft content');
    expect(dbMock.chapters.update).toHaveBeenCalledWith(activeChapter!.id, expect.objectContaining({ content: 'Updated draft content' }));
    expect(useProjectStore.getState().chapters.find(c => c.id === activeChapter!.id)?.content).toBe('Updated draft content');
  });
});
