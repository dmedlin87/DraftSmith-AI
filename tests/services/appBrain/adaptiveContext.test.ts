import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAdaptiveContext,
  DEFAULT_BUDGET,
  VOICE_MODE_BUDGET,
  EDITING_BUDGET,
  DEEP_ANALYSIS_BUDGET,
  estimateTokens,
  selectContextProfile,
  getContextBudgetForModel,
  PROFILE_ALLOCATIONS,
  // Smartness Upgrade: Scene-aware memory filtering
  getSceneContextFromState,
  buildSceneAwareRelevance,
  type SceneContext,
} from '@/services/appBrain/adaptiveContext';
import { eventBus } from '@/services/appBrain/eventBus';
import * as memoryService from '@/services/memory';

vi.mock('@/services/appBrain/eventBus', () => ({
  eventBus: {
    emit: vi.fn(),
    formatRecentEventsForAI: vi.fn(() => 'Events...'),
  },
}));

describe('adaptiveContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseState: any = {
    manuscript: {
      projectTitle: 'Novel',
      chapters: [
        { id: 'c1', title: 'One', content: 'abc', order: 0, updatedAt: 0 },
        { id: 'c2', title: 'Two', content: 'xyz', order: 1, updatedAt: 0 },
      ],
      activeChapterId: 'c1',
      currentText: 'Hello world around cursor',
      setting: { timePeriod: 'Now', location: 'Here' },
    },
    ui: {
      cursor: { position: 6 },
      selection: { text: 'Hello', start: 0, end: 5 },
      microphone: { status: 'idle', mode: 'voice', lastTranscript: null, error: null },
    },
    intelligence: {
      hud: {
        situational: {
          tensionLevel: 'medium',
          pacing: 'steady',
          narrativePosition: { percentComplete: 50 },
          currentScene: { type: 'intro' },
          currentParagraph: { type: 'body' },
        },
        context: { activeEntities: [] },
        prioritizedIssues: [],
        styleAlerts: [],
        stats: { wordCount: 1000, sentenceCount: 100, paragraphCount: 10 },
      },
      timeline: null,
    },
    analysis: { result: null },
    lore: { characters: [], worldRules: [], manuscriptIndex: null },
    session: { chatHistory: [] },
  };

  describe('buildAdaptiveContext', () => {
    it('prefers voice budget when mode provided and tracks inclusions', async () => {
      const result = await buildAdaptiveContext(baseState, 'p1', { budget: VOICE_MODE_BUDGET });

      expect(result.budget.totalTokens).toBeLessThan(DEFAULT_BUDGET.totalTokens);
      expect(result.sectionsIncluded).toContain('manuscript');
    });

    it('truncates sections when exceeding budget', async () => {
      const tinyBudget = { ...DEFAULT_BUDGET, totalTokens: 100 };
      const largeState = {
        ...baseState,
        manuscript: {
          ...baseState.manuscript,
          currentText: 'lorem '.repeat(500),
        },
      };

      const result = await buildAdaptiveContext(largeState, 'p1', { budget: tinyBudget });

      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.tokenCount).toBeLessThanOrEqual(tinyBudget.totalTokens + 100);
    });

    it('uses default budget when no options provided', async () => {
      const result = await buildAdaptiveContext(baseState, 'p1');

      expect(result.budget.totalTokens).toBe(DEFAULT_BUDGET.totalTokens);
    });

    it('ensures a bedside-note planning memory exists for the project', async () => {
      const getMemoriesSpy = vi
        .spyOn(memoryService, 'getMemories')
        .mockResolvedValueOnce([] as any); // No existing bedside note

      const createMemorySpy = vi
        .spyOn(memoryService, 'createMemory')
        .mockResolvedValueOnce({
          id: 'bedside-1',
          scope: 'project',
          projectId: 'p1',
          type: 'plan',
          text: 'Project planning notes for this manuscript. This note will be updated over time with key goals, concerns, and constraints.',
          topicTags: ['meta:bedside-note', 'planner:global', 'arc:story'],
          importance: 0.85,
          createdAt: Date.now(),
        } as any);

      vi
        .spyOn(memoryService, 'getMemoriesForContext')
        .mockResolvedValueOnce({ author: [], project: [] } as any);
      vi
        .spyOn(memoryService, 'getActiveGoals')
        .mockResolvedValueOnce([] as any);

      vi
        .spyOn(memoryService, 'formatMemoriesForPrompt')
        .mockReturnValue('[MEM]');
      vi
        .spyOn(memoryService, 'formatGoalsForPrompt')
        .mockReturnValue('');

      await buildAdaptiveContext(baseState, 'p1');

      expect(getMemoriesSpy).toHaveBeenCalledWith({
        scope: 'project',
        projectId: 'p1',
        type: 'plan',
        topicTags: ['meta:bedside-note'],
        limit: 1,
      });
      expect(createMemorySpy).toHaveBeenCalledTimes(1);
    });

    it('prioritizes bedside-note memories at the top of project memory list', async () => {
      // Simulate that a bedside-note plan already exists so ensureBedsideNoteExists is a no-op
      vi
        .spyOn(memoryService, 'getMemories')
        .mockResolvedValueOnce([
          {
            id: 'bedside-1',
            scope: 'project',
            projectId: 'p1',
            type: 'plan',
            text: 'Bedside planning note',
            topicTags: ['meta:bedside-note', 'planner:global'],
            importance: 0.9,
            createdAt: Date.now(),
          },
        ] as any);

      const memoriesForContext = {
        author: [],
        project: [
          {
            id: 'other-1',
            scope: 'project',
            projectId: 'p1',
            type: 'fact',
            text: 'Some other project fact',
            topicTags: ['general'],
            importance: 0.5,
            createdAt: Date.now(),
          },
          {
            id: 'bedside-1',
            scope: 'project',
            projectId: 'p1',
            type: 'plan',
            text: 'Bedside planning note',
            topicTags: ['meta:bedside-note', 'planner:global'],
            importance: 0.9,
            createdAt: Date.now(),
          },
        ],
      } as any;

      vi
        .spyOn(memoryService, 'getRelevantMemoriesForContext')
        .mockResolvedValueOnce(memoriesForContext);
      vi
        .spyOn(memoryService, 'getActiveGoals')
        .mockResolvedValueOnce([] as any);

      const formatMemoriesForPromptSpy = vi
        .spyOn(memoryService, 'formatMemoriesForPrompt')
        .mockImplementation(({ project }) => project.map((m: any) => m.id).join(','));
      vi
        .spyOn(memoryService, 'formatGoalsForPrompt')
        .mockReturnValue('');

      await buildAdaptiveContext(baseState, 'p1', {
        budget: DEFAULT_BUDGET,
      });

      expect(formatMemoriesForPromptSpy).toHaveBeenCalledTimes(1);
      const [passedMemories] = formatMemoriesForPromptSpy.mock.calls[0];
      expect((passedMemories as any).project.map((m: any) => m.id)).toEqual([
        'bedside-1',
        'other-1',
      ]);
    });

    it('refreshes stale bedside note using latest analysis summary and goals', async () => {
      const staleTimestamp = Date.now() - 1000 * 60 * 60 * 24;
      vi
        .spyOn(memoryService, 'getMemories')
        .mockResolvedValueOnce([
          {
            id: 'bedside-1',
            scope: 'project',
            projectId: 'p1',
            type: 'plan',
            text: 'Old bedside note',
            topicTags: ['meta:bedside-note', 'planner:global'],
            importance: 0.9,
            createdAt: staleTimestamp,
            updatedAt: staleTimestamp,
          },
        ] as any);

      const memoriesForContext = {
        author: [],
        project: [
          {
            id: 'bedside-1',
            scope: 'project',
            projectId: 'p1',
            type: 'plan',
            text: 'Old bedside note',
            topicTags: ['meta:bedside-note', 'planner:global'],
            importance: 0.9,
            createdAt: staleTimestamp,
            updatedAt: staleTimestamp,
          },
          {
            id: 'other-1',
            scope: 'project',
            projectId: 'p1',
            type: 'fact',
            text: 'Another note',
            topicTags: ['general'],
            importance: 0.4,
            createdAt: Date.now(),
          },
        ],
      } as any;

      const refreshedMemoriesForContext = {
        author: [],
        project: [
          {
            id: 'bedside-2',
            scope: 'project',
            projectId: 'p1',
            type: 'plan',
            text: 'New bedside note',
            topicTags: ['meta:bedside-note', 'planner:global'],
            importance: 0.95,
            createdAt: staleTimestamp,
            updatedAt: Date.now(),
          },
          memoriesForContext.project[1],
        ],
      } as any;

      vi
        .spyOn(memoryService, 'getMemoriesForContext')
        .mockResolvedValueOnce(memoriesForContext)
        .mockResolvedValueOnce(refreshedMemoriesForContext);
      const evolveSpy = vi
        .spyOn(memoryService, 'evolveBedsideNote')
        .mockResolvedValueOnce({} as any);
      vi
        .spyOn(memoryService, 'getActiveGoals')
        .mockResolvedValueOnce([
          { id: 'g1', title: 'Finish draft', progress: 30 } as any,
        ]);
      const formatMemoriesForPromptSpy = vi
        .spyOn(memoryService, 'formatMemoriesForPrompt')
        .mockImplementation(({ project }) => project.map((m: any) => m.id).join(','));
      vi.spyOn(memoryService, 'formatGoalsForPrompt').mockReturnValue('');

      const stateWithAnalysis = {
        ...baseState,
        analysis: {
          result: {
            summary: 'Fresh summary',
            strengths: [],
            weaknesses: ['weakness'],
            plotIssues: [{ issue: 'Plot hole' }],
          },
        },
      };

      await buildAdaptiveContext(stateWithAnalysis, 'p1', {
        budget: DEFAULT_BUDGET,
        bedsideNoteStalenessMs: 1000 * 60 * 60,
        sceneAwareMemory: false,
      });

      expect(evolveSpy).toHaveBeenCalledTimes(1);
      const [projectIdArg, planText, options] = evolveSpy.mock.calls[0];
      expect(projectIdArg).toBe('p1');
      expect(planText).toContain('Fresh summary');
      expect(planText).toContain('Finish draft');
      expect(options).toEqual({ changeReason: 'staleness_refresh' });
      const [passedMemories] = formatMemoriesForPromptSpy.mock.calls[0];
      expect((passedMemories as any).project.map((m: any) => m.id)).toEqual([
        'bedside-2',
        'other-1',
      ]);
    });

    it('does not refresh bedside note when within staleness threshold', async () => {
      const recentTimestamp = Date.now() - 1000 * 60 * 10;
      vi
        .spyOn(memoryService, 'getMemories')
        .mockResolvedValueOnce([
          {
            id: 'bedside-1',
            scope: 'project',
            projectId: 'p1',
            type: 'plan',
            text: 'Recent bedside note',
            topicTags: ['meta:bedside-note', 'planner:global'],
            importance: 0.9,
            createdAt: recentTimestamp,
            updatedAt: recentTimestamp,
          },
        ] as any);

      vi
        .spyOn(memoryService, 'getMemoriesForContext')
        .mockResolvedValueOnce({
          author: [],
          project: [
            {
              id: 'bedside-1',
              scope: 'project',
              projectId: 'p1',
              type: 'plan',
              text: 'Recent bedside note',
              topicTags: ['meta:bedside-note', 'planner:global'],
              importance: 0.9,
              createdAt: recentTimestamp,
              updatedAt: recentTimestamp,
            },
          ],
        } as any);
      const evolveSpy = vi
        .spyOn(memoryService, 'evolveBedsideNote')
        .mockResolvedValue({} as any);
      vi.spyOn(memoryService, 'getActiveGoals').mockResolvedValueOnce([] as any);
      vi.spyOn(memoryService, 'formatMemoriesForPrompt').mockReturnValue('');
      vi.spyOn(memoryService, 'formatGoalsForPrompt').mockReturnValue('');

      await buildAdaptiveContext(baseState, 'p1', {
        budget: DEFAULT_BUDGET,
        bedsideNoteStalenessMs: 1000 * 60 * 60,
        sceneAwareMemory: false,
      });

      expect(evolveSpy).not.toHaveBeenCalled();
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens by character count', () => {
      expect(estimateTokens('12345678')).toBe(2);
    });

    it('handles empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('selectContextProfile', () => {
    it('returns voice profile for voice mode', () => {
      expect(selectContextProfile({ mode: 'voice', hasSelection: false })).toBe('voice');
      expect(selectContextProfile({ mode: 'voice', hasSelection: true })).toBe('voice');
    });

    it('returns analysis_deep for analysis queryType', () => {
      expect(selectContextProfile({ mode: 'text', hasSelection: false, queryType: 'analysis' })).toBe('analysis_deep');
    });

    it('returns editing for editing queryType or selection', () => {
      expect(selectContextProfile({ mode: 'text', hasSelection: true })).toBe('editing');
      expect(selectContextProfile({ mode: 'text', hasSelection: false, queryType: 'editing' })).toBe('editing');
    });

    it('returns full for general text mode without selection', () => {
      expect(selectContextProfile({ mode: 'text', hasSelection: false })).toBe('full');
      expect(selectContextProfile({ mode: 'text', hasSelection: false, queryType: 'general' })).toBe('full');
    });
  });

  describe('getContextBudgetForModel', () => {
    it('returns budget with appropriate total tokens', () => {
      const budget = getContextBudgetForModel('agent', 'full');

      expect(budget.totalTokens).toBeGreaterThan(0);
      expect(budget.totalTokens).toBeLessThanOrEqual(16000); // maxBudget default
    });

    it('uses profile allocations', () => {
      const editingBudget = getContextBudgetForModel('agent', 'editing');
      const voiceBudget = getContextBudgetForModel('agent', 'voice');

      expect(editingBudget.sections).toEqual(PROFILE_ALLOCATIONS.editing);
      expect(voiceBudget.sections).toEqual(PROFILE_ALLOCATIONS.voice);
    });

    it('respects maxBudget option', () => {
      const budget = getContextBudgetForModel('agent', 'full', { maxBudget: 5000 });

      expect(budget.totalTokens).toBeLessThanOrEqual(5000);
    });

    it('respects reserveForResponse option', () => {
      const normalBudget = getContextBudgetForModel('agent', 'full');
      const largeReserveBudget = getContextBudgetForModel('agent', 'full', { reserveForResponse: 10000 });

      // Larger reserve should result in smaller available budget
      expect(largeReserveBudget.totalTokens).toBeLessThanOrEqual(normalBudget.totalTokens);
    });
  });

  describe('PROFILE_ALLOCATIONS', () => {
    it('has all expected profiles', () => {
      expect(PROFILE_ALLOCATIONS).toHaveProperty('full');
      expect(PROFILE_ALLOCATIONS).toHaveProperty('editing');
      expect(PROFILE_ALLOCATIONS).toHaveProperty('voice');
      expect(PROFILE_ALLOCATIONS).toHaveProperty('analysis_deep');
    });

    it('all profiles sum to ~1.0', () => {
      for (const [profile, sections] of Object.entries(PROFILE_ALLOCATIONS)) {
        const sum = Object.values(sections).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 1);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SMARTNESS UPGRADE: Scene-Aware Memory Filtering
  // ─────────────────────────────────────────────────────────────────────────

  describe('getSceneContextFromState', () => {
    it('returns default context when no HUD available', () => {
      const stateWithoutHud = {
        ...baseState,
        intelligence: { hud: null },
      };

      const context = getSceneContextFromState(stateWithoutHud);

      expect(context.sceneType).toBeNull();
      expect(context.location).toBeNull();
      expect(context.pov).toBeNull();
      expect(context.tensionLevel).toBe('medium');
    });

    it('extracts scene context from HUD', () => {
      const stateWithScene = {
        ...baseState,
        intelligence: {
          hud: {
            ...baseState.intelligence.hud,
            situational: {
              ...baseState.intelligence.hud.situational,
              currentScene: {
                type: 'action',
                pov: 'Seth',
                location: 'Castle',
              },
              tensionLevel: 'high',
            },
          },
        },
      };

      const context = getSceneContextFromState(stateWithScene);

      expect(context.sceneType).toBe('action');
      expect(context.pov).toBe('Seth');
      expect(context.location).toBe('Castle');
      expect(context.tensionLevel).toBe('high');
    });
  });

  describe('buildSceneAwareRelevance', () => {
    it('adds scene-type-specific keywords', () => {
      const baseRelevance = { activeEntityNames: [], selectionKeywords: [] };
      const actionContext: SceneContext = {
        sceneType: 'action',
        location: null,
        pov: null,
        tensionLevel: 'medium',
      };

      const result = buildSceneAwareRelevance(baseRelevance, actionContext);

      // Action scenes should add combat/tension keywords
      expect(result.selectionKeywords).toContain('conflict');
      expect(result.selectionKeywords).toContain('tension');
      expect(result.selectionKeywords).toContain('stakes');
    });

    it('adds dialogue-specific keywords for dialogue scenes', () => {
      const baseRelevance = { activeEntityNames: [], selectionKeywords: [] };
      const dialogueContext: SceneContext = {
        sceneType: 'dialogue',
        location: null,
        pov: null,
        tensionLevel: 'low',
      };

      const result = buildSceneAwareRelevance(baseRelevance, dialogueContext);

      expect(result.selectionKeywords).toContain('relationship');
      expect(result.selectionKeywords).toContain('conversation');
      expect(result.selectionKeywords).toContain('voice');
    });

    it('adds tension-level keywords', () => {
      const baseRelevance = { activeEntityNames: [], selectionKeywords: [] };
      const highTensionContext: SceneContext = {
        sceneType: null,
        location: null,
        pov: null,
        tensionLevel: 'high',
      };

      const result = buildSceneAwareRelevance(baseRelevance, highTensionContext);

      // High tension should boost conflict/stakes keywords
      expect(result.selectionKeywords).toContain('conflict');
      expect(result.selectionKeywords).toContain('stakes');
      expect(result.selectionKeywords).toContain('climax');
    });

    it('adds location as keyword', () => {
      const baseRelevance = { activeEntityNames: [], selectionKeywords: [] };
      const locationContext: SceneContext = {
        sceneType: null,
        location: 'The Castle',
        pov: null,
        tensionLevel: 'medium',
      };

      const result = buildSceneAwareRelevance(baseRelevance, locationContext);

      expect(result.selectionKeywords).toContain('the castle');
    });

    it('adds POV character to active entities', () => {
      const baseRelevance = { activeEntityNames: ['Maria'], selectionKeywords: [] };
      const povContext: SceneContext = {
        sceneType: null,
        location: null,
        pov: 'Seth',
        tensionLevel: 'medium',
      };

      const result = buildSceneAwareRelevance(baseRelevance, povContext);

      expect(result.activeEntityNames).toContain('Maria');
      expect(result.activeEntityNames).toContain('Seth');
    });

    it('preserves base relevance keywords', () => {
      const baseRelevance = { 
        activeEntityNames: ['TestChar'], 
        selectionKeywords: ['custom', 'keywords'] 
      };
      const context: SceneContext = {
        sceneType: 'action',
        location: null,
        pov: null,
        tensionLevel: 'medium',
      };

      const result = buildSceneAwareRelevance(baseRelevance, context);

      expect(result.selectionKeywords).toContain('custom');
      expect(result.selectionKeywords).toContain('keywords');
      expect(result.activeEntityNames).toContain('TestChar');
    });

    it('deduplicates keywords', () => {
      const baseRelevance = { 
        activeEntityNames: [], 
        selectionKeywords: ['conflict', 'tension'] // Already has these
      };
      const actionContext: SceneContext = {
        sceneType: 'action', // Would add conflict, tension again
        location: null,
        pov: null,
        tensionLevel: 'high', // Would add conflict again
      };

      const result = buildSceneAwareRelevance(baseRelevance, actionContext);

      // Should not have duplicates
      const conflictCount = result.selectionKeywords!.filter(k => k === 'conflict').length;
      expect(conflictCount).toBe(1);
    });
  });

  describe('buildAdaptiveContext with sceneAwareMemory', () => {
    it('applies scene-aware filtering by default', async () => {
      const stateWithScene = {
        ...baseState,
        intelligence: {
          hud: {
            ...baseState.intelligence.hud,
            situational: {
              ...baseState.intelligence.hud.situational,
              currentScene: { type: 'dialogue', pov: 'Seth', location: 'Cafe' },
              tensionLevel: 'low',
            },
          },
        },
      };

      // Should not throw
      const result = await buildAdaptiveContext(stateWithScene, 'p1');
      expect(result.context).toBeDefined();
    });

    it('can disable scene-aware filtering', async () => {
      const result = await buildAdaptiveContext(baseState, 'p1', { 
        sceneAwareMemory: false 
      });
      
      expect(result.context).toBeDefined();
    });
  });
});
