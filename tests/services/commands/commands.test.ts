import { describe, it, expect, vi } from 'vitest';
import { NavigateToTextCommand, JumpToChapterCommand, JumpToSceneCommand } from '@/services/commands/navigation';
import { UpdateManuscriptCommand, AppendTextCommand } from '@/services/commands/editing';
import { GetCritiqueCommand, RunAnalysisCommand } from '@/services/commands/analysis';
import { QueryLoreCommand, GetCharacterInfoCommand } from '@/services/commands/knowledge';
import { SwitchPanelCommand, ToggleZenModeCommand, HighlightTextCommand, SetSelectionCommand } from '@/services/commands/ui';
import { RewriteSelectionCommand, ContinueWritingCommand } from '@/services/commands/generation';
import { CommandRegistry } from '@/services/commands/registry';

const mockDeps = {
  currentText: 'Hello world '.repeat(5),
  activeChapterId: 'c1',
  chapters: [
    { id: 'c1', title: 'One', content: 'Hello world', order: 0, updatedAt: 0 },
    { id: 'c2', title: 'Two', content: 'Second chapter', order: 1, updatedAt: 0 },
  ],
  selectChapter: vi.fn(),
  navigateToRange: vi.fn(),
  scrollToPosition: vi.fn(),
  intelligence: { structural: { scenes: [{ startOffset: 10, endOffset: 20, type: 'intro' }] } },
  cursorPosition: 0,
  runExclusiveEdit: vi.fn(async (fn) => fn()),
  commitEdit: vi.fn(),
  selection: { text: 'Hello', start: 0, end: 5 },
  switchPanel: vi.fn(),
  analyzePacing: vi.fn(),
  analyzeCharacters: vi.fn(),
  analyzePlot: vi.fn(),
  analyzeSetting: vi.fn(),
  runFullAnalysis: vi.fn(),
  lore: { characters: [{ name: 'Bob', description: 'Hero' }], worldRules: [] },
  branchHistory: { undo: vi.fn(), redo: vi.fn() },
  setActivePanel: vi.fn(),
  toggleZenMode: vi.fn(),
  highlightText: vi.fn(),
  setSelection: vi.fn(),
  generateRewrite: vi.fn(async () => 'rewritten text'),
  generateContinuation: vi.fn(async () => 'continued text that is sufficiently long'),
};

describe('command execute paths', () => {
  it('navigates to text and handles missing match', async () => {
    const cmd = new NavigateToTextCommand();
    const success = await cmd.execute({ query: 'Hello', searchType: 'exact' } as any, mockDeps as any);
    expect(mockDeps.navigateToRange).toHaveBeenCalled();
    const missing = await cmd.execute({ query: 'missing' } as any, mockDeps as any);
    expect(missing).toContain('Could not find');
  });

  it('jumps to chapter and scene', async () => {
    const jumpChapter = new JumpToChapterCommand();
    const res = await jumpChapter.execute('One', mockDeps as any);
    expect(res).toContain('Switched');

    const jumpScene = new JumpToSceneCommand();
    const sceneRes = await jumpScene.execute({ sceneType: 'intro', direction: 'next' }, mockDeps as any);
    expect(sceneRes).toContain('Jumped');
  });

  it('updates and appends manuscript with error path', async () => {
    const update = new UpdateManuscriptCommand();
    const ok = await update.execute({ searchText: 'Hello', replacementText: 'Hi', description: 'greet' } as any, mockDeps as any);
    expect(mockDeps.commitEdit).toHaveBeenCalled();
    const fail = await update.execute({ searchText: 'missing text', replacementText: 'noop', description: 'fail' } as any, mockDeps as any);
    expect(fail).toContain('Error');

    const append = new AppendTextCommand();
    await append.execute({ text: 'More', description: 'append' }, mockDeps as any);
    expect(mockDeps.commitEdit).toHaveBeenCalledTimes(2);
  });

  it('runs analysis and critique commands', async () => {
    const critique = new GetCritiqueCommand();
    const critiqueRes = await critique.execute('focus', mockDeps as any);
    expect(critiqueRes).toContain('Critique');

    const analysis = new RunAnalysisCommand();
    await analysis.execute('pacing', mockDeps as any);
    expect(mockDeps.analyzePacing).toHaveBeenCalled();
  });

  it('handles knowledge commands', async () => {
    const queryLore = new QueryLoreCommand();
    const loreRes = await queryLore.execute('Bob', mockDeps as any);
    expect(loreRes).toContain('Bob');

    const getChar = new GetCharacterInfoCommand();
    const charRes = await getChar.execute('Bob', mockDeps as any);
    expect(charRes).toContain('Bob');
  });

  it('manages ui commands and undo path', async () => {
    const switchPanel = new SwitchPanelCommand();
    await switchPanel.execute('chat' as any, mockDeps as any);
    expect(mockDeps.switchPanel).toHaveBeenCalled();

    const toggleZen = new ToggleZenModeCommand();
    await toggleZen.execute({ enabled: true } as any, mockDeps as any);
    expect(mockDeps.toggleZenMode).toHaveBeenCalled();

    const highlight = new HighlightTextCommand();
    await highlight.execute({ highlight: 'hi' } as any, mockDeps as any);
    expect(mockDeps.highlightText).toHaveBeenCalled();

    const setSelection = new SetSelectionCommand();
    await setSelection.execute({ start: 0, end: 1, text: 'H' } as any, mockDeps as any);
    expect(mockDeps.setSelection).toHaveBeenCalled();
  });

  it('handles generation commands with undo support', async () => {
    const rewrite = new RewriteSelectionCommand();
    const result = await rewrite.execute({ mode: 'rephrase' } as any, mockDeps as any);
    expect(result).toContain('Rewrote selection');

    const continueCmd = new ContinueWritingCommand();
    const continueRes = await continueCmd.execute(undefined as any, mockDeps as any);
    expect(continueRes).toContain('Added');
    expect(mockDeps.generateContinuation).toHaveBeenCalledWith({
      context: 'Hello',
      selection: 'Hello',
    });
  });
});

describe('CommandRegistry wiring', () => {
  it('creates default command instances', () => {
    expect(CommandRegistry.has('navigate_to_text')).toBe(true);
    const cmd = CommandRegistry.create('navigate_to_text');
    expect(cmd).toBeTruthy();
    expect(CommandRegistry.getByCategory('navigation').length).toBeGreaterThan(0);
  });
});
