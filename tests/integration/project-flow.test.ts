import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '@/features/project/store/useProjectStore';

vi.mock('@/services/manuscriptIndexer', () => ({
  createEmptyIndex: vi.fn(() => ({ characters: {}, lastUpdated: {} })),
}));

let uuidCounter = 0;

describe('Project flow integration', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) });
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
    expect(stateAfterCreate.projects).toHaveLength(1);
    expect(stateAfterCreate.chapters).toHaveLength(1);

    const activeChapter = getActiveChapter();
    expect(activeChapter?.title).toBe('Chapter 1');

    await updateChapterContent(activeChapter!.id, 'Updated draft content');

    const updatedState = useProjectStore.getState();
    const savedChapter = updatedState.chapters.find(c => c.id === activeChapter!.id);
    expect(savedChapter?.content).toBe('Updated draft content');
  });
});
