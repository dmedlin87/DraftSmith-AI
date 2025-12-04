import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppBrainActions } from '@/services/appBrain';

// Hoisted mocks for command history and registry
vi.mock('@/services/commands/history', () => {
  const history = {
    record: vi.fn(),
    persist: vi.fn(),
    formatForPrompt: vi.fn().mockReturnValue('[HISTORY]'),
  };

  return {
    getCommandHistory: () => history,
  };
});

vi.mock('@/services/commands/registry', () => {
  const registry = {
    isReversible: vi.fn((name: string) => name === 'update_manuscript'),
    get: vi.fn(),
    has: vi.fn((name: string) => name === 'update_manuscript'),
  };

  return {
    CommandRegistry: registry,
  };
});

vi.mock('@/services/memory', () => {
  const createMemory = vi.fn().mockResolvedValue({
    text: 'Note text',
    scope: 'project',
    type: 'observation',
  });
  const updateMemory = vi.fn().mockResolvedValue({
    text: 'Updated text',
    scope: 'project',
    type: 'observation',
  });
  const deleteMemory = vi.fn().mockResolvedValue(undefined);
  const addGoal = vi.fn().mockResolvedValue({
    title: 'Goal',
    status: 'active',
    progress: 0,
  });
  const updateGoal = vi.fn().mockResolvedValue({
    title: 'Goal',
    status: 'completed',
    progress: 100,
  });
  const addWatchedEntity = vi.fn().mockResolvedValue({
    name: 'Seth',
    priority: 'high',
  });
  const applyBedsideNoteMutation = vi.fn().mockResolvedValue({
    text: 'New bedside note text',
  });
  const searchMemoriesByTags = vi.fn().mockResolvedValue([
    { scope: 'project', type: 'observation', text: 'note1' },
    { scope: 'author', type: 'preference', text: 'note2' },
  ]);
  const formatMemoriesForPrompt = vi.fn().mockReturnValue('formatted memories');

  return {
    createMemory,
    updateMemory,
    deleteMemory,
    addGoal,
    updateGoal,
    addWatchedEntity,
    applyBedsideNoteMutation,
    searchMemoriesByTags,
    formatMemoriesForPrompt,
  };
});

import * as memoryModule from '@/services/memory';
import { getCommandHistory } from '@/services/commands/history';
import { CommandRegistry } from '@/services/commands/registry';

import {
  isMemoryToolName,
  executeAppBrainToolCall,
  executeMemoryToolCall,
  executeAgentToolCall,
  ToolExecutor,
} from '@/services/gemini/toolExecutor';

const createMockActions = (): AppBrainActions => ({
  // Navigation
  navigateToText: vi.fn(async () => 'navigated'),
  jumpToChapter: vi.fn(async () => 'jumped'),
  jumpToScene: vi.fn(async () => 'scene'),
  scrollToPosition: vi.fn(),

  // Editing
  updateManuscript: vi.fn(async () => 'updated'),
  appendText: vi.fn(async () => 'appended'),
  undo: vi.fn(async () => 'undone'),
  redo: vi.fn(async () => 'redone'),

  // Analysis
  getCritiqueForSelection: vi.fn(async () => 'critique'),
  runAnalysis: vi.fn(async () => 'analysis'),

  // UI
  switchPanel: vi.fn(async () => 'switched'),
  toggleZenMode: vi.fn(async () => 'zen'),
  highlightText: vi.fn(async () => 'highlighted'),
  setMicrophoneState: vi.fn(),

  // Knowledge
  queryLore: vi.fn(async () => 'lore'),
  getCharacterInfo: vi.fn(async () => 'character info'),
  getTimelineContext: vi.fn(async () => 'timeline'),

  // Generation
  rewriteSelection: vi.fn(async () => 'rewritten'),
  continueWriting: vi.fn(async () => 'continued'),
});

describe('toolExecutor core helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('identifies memory tool names correctly', () => {
    expect(isMemoryToolName('write_memory_note')).toBe(true);
    expect(isMemoryToolName('search_memory')).toBe(true);
    expect(isMemoryToolName('update_memory_note')).toBe(true);
    expect(isMemoryToolName('delete_memory_note')).toBe(true);
    expect(isMemoryToolName('create_goal')).toBe(true);
    expect(isMemoryToolName('update_goal')).toBe(true);
    expect(isMemoryToolName('watch_entity')).toBe(true);

    expect(isMemoryToolName('navigate_to_text')).toBe(false);
    expect(isMemoryToolName('rewrite_selection')).toBe(false);
  });

  it('routes update_manuscript to AppBrainActions with correct params', async () => {
    const actions = createMockActions();

    const result = await executeAppBrainToolCall(
      'update_manuscript',
      {
        search_text: 'old',
        replacement_text: 'new',
        description: 'desc',
      },
      actions,
    );

    expect(actions.updateManuscript).toHaveBeenCalledWith({
      searchText: 'old',
      replacementText: 'new',
      description: 'desc',
    });
    expect(result).toEqual({ success: true, message: 'updated' });
  });

  it('handles unknown AppBrain tools as success with message', async () => {
    const actions = createMockActions();

    const result = await executeAppBrainToolCall('unknown_tool', {}, actions);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Unknown tool: unknown_tool');
  });

  it('wraps AppBrain action errors in ToolResult', async () => {
    const actions = createMockActions();
    (actions.updateManuscript as any).mockRejectedValueOnce(new Error('boom'));

    const result = await executeAppBrainToolCall(
      'update_manuscript',
      { search_text: 'a', replacement_text: 'b', description: 'c' },
      actions,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Error executing update_manuscript');
    expect(result.error).toBe('boom');
  });

  it('executes write_memory_note and returns formatted message', async () => {
    const result = await executeMemoryToolCall(
      'write_memory_note',
      {
        text: 'Note text',
        type: 'observation',
        scope: 'project',
        tags: ['tag1'],
        importance: 0.7,
      },
      'project-1',
    );

    expect(memoryModule.createMemory).toHaveBeenCalledWith({
      scope: 'project',
      projectId: 'project-1',
      text: 'Note text',
      type: 'observation',
      topicTags: ['tag1'],
      importance: 0.7,
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('Saved memory note');
  });

  it('returns failure for unknown memory tool', async () => {
    const result = await executeMemoryToolCall('unknown_memory', {}, 'project-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('UnknownMemoryTool');
  });

  it('executeAgentToolCall routes memory tools to executeMemoryToolCall', async () => {
    const actions = createMockActions();

    const result = await executeAgentToolCall(
      'write_memory_note',
      { text: 'Note text', type: 'observation', scope: 'author' },
      actions,
      'project-1',
    );

    expect(memoryModule.createMemory).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('handles update_bedside_note via memory helper', async () => {
    const result = await executeMemoryToolCall(
      'update_bedside_note',
      { section: 'currentFocus', action: 'set', content: 'Fresh focus' },
      'project-1',
    );

    expect(memoryModule.applyBedsideNoteMutation).toHaveBeenCalledWith('project-1', {
      section: 'currentFocus',
      action: 'set',
      content: 'Fresh focus',
    });
    expect(result.message).toContain('Bedside note set applied');
    expect(result.success).toBe(true);
  });
});

describe('ToolExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes non-memory tools and records to history', async () => {
    const actions = createMockActions();
    const executor = new ToolExecutor(actions, 'project-1', true);

    const args = {
      search_text: 'old',
      replacement_text: 'new',
      description: 'desc',
    };

    const result = await executor.execute('update_manuscript', args);

    expect(result).toEqual({ success: true, message: 'updated' });
    const history = getCommandHistory();
    expect(history.record).toHaveBeenCalledWith({
      toolName: 'update_manuscript',
      params: args,
      result: 'updated',
      success: true,
      reversible: true,
    });
    expect(history.persist).toHaveBeenCalled();
  });

  it('does not record history for memory tools', async () => {
    const actions = createMockActions();
    const executor = new ToolExecutor(actions, 'project-1', true);

    await executor.execute('write_memory_note', {
      text: 'Note text',
      type: 'observation',
      scope: 'project',
    });

    const history = getCommandHistory();
    expect(history.record).not.toHaveBeenCalled();
    expect(memoryModule.createMemory).toHaveBeenCalled();
  });

  it('exposes command metadata via getCommandInfo', () => {
    const actions = createMockActions();
    const executor = new ToolExecutor(actions, 'project-1', true);

    const meta = { name: 'update_manuscript' } as any;
    (CommandRegistry.get as any).mockReturnValueOnce(meta);

    expect(executor.getCommandInfo('update_manuscript')).toBe(meta);
    expect(CommandRegistry.get).toHaveBeenCalledWith('update_manuscript');
  });

  it('hasCommand checks registry and memory tools', () => {
    const actions = createMockActions();
    const executor = new ToolExecutor(actions, 'project-1', true);

    (CommandRegistry.has as any).mockReturnValueOnce(true);
    expect(executor.hasCommand('update_manuscript')).toBe(true);

    (CommandRegistry.has as any).mockReturnValueOnce(false);
    expect(executor.hasCommand('watch_entity')).toBe(true);
  });

  it('getHistoryForPrompt delegates to CommandHistory', () => {
    const actions = createMockActions();
    const executor = new ToolExecutor(actions, 'project-1', true);

    const text = executor.getHistoryForPrompt(3);

    const history = getCommandHistory();
    expect(history.formatForPrompt).toHaveBeenCalledWith(3);
    expect(text).toBe('[HISTORY]');
  });
});
