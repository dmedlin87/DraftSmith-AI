import { AppBrainActions } from '@/services/appBrain';
import {
  createMemory,
  updateMemory,
  deleteMemory,
  addGoal,
  updateGoal,
  addWatchedEntity,
  searchMemoriesByTags,
  formatMemoriesForPrompt,
  applyBedsideNoteMutation,
} from '@/services/memory';
import { CommandRegistry } from '@/services/commands/registry';
import { getCommandHistory } from '@/services/commands/history';

export interface ToolResult {
  success: boolean;
  message: string;
  error?: string;
}

const MEMORY_TOOL_NAMES = new Set<string>([
  'write_memory_note',
  'search_memory',
  'update_memory_note',
  'delete_memory_note',
  'create_goal',
  'update_goal',
  'watch_entity',
  'update_bedside_note',
]);

export function isMemoryToolName(toolName: string): boolean {
  return MEMORY_TOOL_NAMES.has(toolName);
}

export async function executeAppBrainToolCall(
  toolName: string,
  args: Record<string, unknown>,
  actions: AppBrainActions,
): Promise<ToolResult> {
  try {
    let result: string;

    switch (toolName) {
      // Navigation
      case 'navigate_to_text':
        result = await actions.navigateToText({
          query: args.query as string,
          searchType: args.searchType as any,
          character: args.character as string,
          chapter: args.chapter as string,
        });
        break;
      case 'jump_to_chapter':
        result = await actions.jumpToChapter(args.identifier as string);
        break;
      case 'jump_to_scene':
        result = await actions.jumpToScene(
          args.sceneType as string,
          args.direction as 'next' | 'previous',
        );
        break;
      case 'scroll_to_position':
        actions.scrollToPosition(args.position as number);
        result = `Scrolled to position ${args.position}`;
        break;

      // Editing
      case 'update_manuscript':
        result = await actions.updateManuscript({
          searchText: (args.searchText ?? args.search_text) as string,
          replacementText: (args.replacementText ?? args.replacement_text) as string,
          description: args.description as string,
        });
        break;
      case 'append_to_manuscript':
        result = await actions.appendText(
          args.text as string,
          args.description as string,
        );
        break;
      case 'insert_at_cursor':
        result = await actions.appendText(
          args.text as string,
          args.description as string,
        );
        break;
      case 'undo_last_change':
        result = await actions.undo();
        break;
      case 'redo_last_change':
        result = await actions.redo();
        break;

      // Analysis
      case 'get_critique_for_selection':
        result = await actions.getCritiqueForSelection(args.focus as string);
        break;
      case 'run_analysis':
        result = await actions.runAnalysis(args.section as string);
        break;

      // UI Control
      case 'switch_panel':
        actions.switchPanel(args.panel as string);
        result = `Switched to ${args.panel} panel`;
        break;
      case 'toggle_zen_mode':
        actions.toggleZenMode();
        result = 'Toggled Zen mode';
        break;
      case 'highlight_text':
        actions.highlightText(
          args.start as number,
          args.end as number,
          args.style as string,
        );
        result = `Highlighted text at ${args.start}-${args.end}`;
        break;
      case 'set_selection':
        actions.highlightText(
          args.start as number,
          args.end as number,
          'info',
        );
        result = `Selected text from ${args.start} to ${args.end}`;
        break;

      // Knowledge
      case 'query_lore':
        result = await actions.queryLore(args.query as string);
        break;
      case 'get_character_info':
        result = await actions.getCharacterInfo(args.name as string);
        break;
      case 'get_timeline_context':
        result = await actions.getTimelineContext(args.range as any);
        break;

      // Generation
      case 'rewrite_selection':
        result = await actions.rewriteSelection({
          mode: args.mode as any,
          targetTone: args.targetTone as string,
        });
        break;
      case 'continue_writing':
        result = await actions.continueWriting();
        break;

      default:
        result = `Unknown tool: ${toolName}`;
    }
    return {
      success: true,
      message: result,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return {
      success: false,
      message: `Error executing ${toolName}: ${error}`,
      error,
    };
  }
}

export async function executeMemoryToolCall(
  toolName: string,
  args: Record<string, unknown>,
  projectId: string | null,
): Promise<ToolResult> {
  try {
    let message: string;

    switch (toolName) {
      case 'write_memory_note': {
        const scope = (args.scope as string) || 'project';
        const text = args.text as string;
        const type = args.type as string;
        const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
        const importance =
          typeof args.importance === 'number' ? (args.importance as number) : 0.5;

        if (!text || !type || !scope) {
          throw new Error('Missing required fields for write_memory_note');
        }

        if (scope === 'project' && !projectId) {
          throw new Error('Cannot write project-scoped memory without an active projectId');
        }

        const note = await createMemory({
          scope: scope as any,
          projectId: scope === 'project' ? projectId ?? undefined : undefined,
          text,
          type: type as any,
          topicTags: tags,
          importance,
        });

        const preview = note.text.length > 120
          ? `${note.text.slice(0, 117)}...`
          : note.text;

        message = `Saved memory note (${note.scope}/${note.type}): ${preview}`;
        break;
      }

      case 'search_memory': {
        const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
        const type = args.type as string | undefined;
        const scopeArg = (args.scope as string | undefined) ?? 'all';

        const results = await searchMemoriesByTags(tags, {
          projectId: projectId ?? undefined,
          limit: 50,
        });

        let filtered = results;
        if (scopeArg === 'project') {
          filtered = filtered.filter(n => n.scope === 'project');
        } else if (scopeArg === 'author') {
          filtered = filtered.filter(n => n.scope === 'author');
        }
        if (type) {
          filtered = filtered.filter(n => n.type === type);
        }

        const author = filtered.filter(n => n.scope === 'author');
        const project = filtered.filter(n => n.scope === 'project');
        const formatted = formatMemoriesForPrompt({ author, project }, { maxLength: 2000 });
        message = formatted || 'No matching memories found.';
        break;
      }

      case 'update_memory_note': {
        const id = args.id as string;
        if (!id) {
          throw new Error('Missing id for update_memory_note');
        }

        const updates: Record<string, unknown> = {};
        if (typeof args.text === 'string') {
          updates.text = args.text as string;
        }
        if (typeof args.importance === 'number') {
          updates.importance = args.importance as number;
        }
        if (Array.isArray(args.tags)) {
          updates.topicTags = args.tags as string[];
        }

        const updated = await updateMemory(id, updates as any);
        const preview = updated.text.length > 120
          ? `${updated.text.slice(0, 117)}...`
          : updated.text;
        message = `Updated memory note (${updated.scope}/${updated.type}): ${preview}`;
        break;
      }

      case 'delete_memory_note': {
        const id = args.id as string;
        if (!id) {
          throw new Error('Missing id for delete_memory_note');
        }
        await deleteMemory(id);
        message = `Deleted memory note ${id}`;
        break;
      }

      case 'create_goal': {
        if (!projectId) {
          throw new Error('Cannot create goal without an active projectId');
        }
        const title = args.title as string;
        const description = args.description as string | undefined;
        if (!title) {
          throw new Error('Missing title for create_goal');
        }

        const goal = await addGoal({
          projectId,
          title,
          description,
          status: 'active',
        });
        message = `Created goal "${goal.title}" (status: ${goal.status}, progress: ${goal.progress}%)`;
        break;
      }

      case 'update_goal': {
        const id = args.id as string;
        if (!id) {
          throw new Error('Missing id for update_goal');
        }

        const updates: Record<string, unknown> = {};
        if (typeof args.progress === 'number') {
          updates.progress = args.progress as number;
        }
        if (typeof args.status === 'string') {
          updates.status = args.status as string;
        }

        const goal = await updateGoal(id, updates as any);
        message = `Updated goal "${goal.title}" (status: ${goal.status}, progress: ${goal.progress}%)`;
        break;
      }

      case 'watch_entity': {
        if (!projectId) {
          throw new Error('Cannot watch entity without an active projectId');
        }
        const name = args.name as string;
        const reason = args.reason as string | undefined;
        const priority = (args.priority as string | undefined) ?? 'medium';
        if (!name) {
          throw new Error('Missing name for watch_entity');
        }

        const entity = await addWatchedEntity({
          name,
          projectId,
          priority: priority as any,
          reason,
        });
        message = `Added watched entity "${entity.name}" (priority: ${entity.priority})`;
        break;
      }

      case 'update_bedside_note': {
        if (!projectId) {
          throw new Error('Cannot update bedside note without an active projectId');
        }

        const section = args.section as string;
        const action = args.action as string;
        if (!section || !action || typeof args.content === 'undefined') {
          throw new Error('Missing required fields for update_bedside_note');
        }

        const updated = await applyBedsideNoteMutation(projectId, {
          section: section as any,
          action: action as any,
          content: args.content,
        });

        message = `Bedside note ${action} applied to ${section}. New text: ${updated.text}`;
        break;
      }

      default:
        return {
          success: false,
          message: `Unknown memory tool: ${toolName}`,
          error: 'UnknownMemoryTool',
        };
    }

    return {
      success: true,
      message,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return {
      success: false,
      message: `Error executing memory tool ${toolName}: ${error}`,
      error,
    };
  }
}

export async function executeAgentToolCall(
  toolName: string,
  args: Record<string, unknown>,
  actions: AppBrainActions,
  projectId: string | null,
): Promise<ToolResult> {
  if (isMemoryToolName(toolName)) {
    return executeMemoryToolCall(toolName, args, projectId);
  }
  return executeAppBrainToolCall(toolName, args, actions);
}

/**
 * Record command execution to history
 */
function recordToHistory(
  toolName: string,
  params: Record<string, unknown>,
  result: ToolResult,
): void {
  const history = getCommandHistory();
  history.record({
    toolName,
    params,
    result: result.message,
    success: result.success,
    reversible: CommandRegistry.isReversible(toolName),
  });
  history.persist();
}

/**
 * Optional OO-style executor wrapper around AppBrainActions.
 * Pure logic: no React or event/system dependencies.
 * Now integrates with CommandRegistry and CommandHistory.
 */
export class ToolExecutor {
  constructor(
    private readonly actions: AppBrainActions, 
    private readonly projectId: string | null = null,
    private readonly recordHistory: boolean = true,
  ) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await executeAgentToolCall(toolName, args, this.actions, this.projectId);
    
    // Record to history (unless it's a memory tool - those have their own tracking)
    if (this.recordHistory && !isMemoryToolName(toolName)) {
      recordToHistory(toolName, args, result);
    }
    
    return result;
  }

  /**
   * Get command metadata from registry
   */
  getCommandInfo(toolName: string) {
    return CommandRegistry.get(toolName);
  }

  /**
   * Check if a command exists
   */
  hasCommand(toolName: string): boolean {
    return CommandRegistry.has(toolName) || isMemoryToolName(toolName);
  }

  /**
   * Get recent command history for context
   */
  getHistoryForPrompt(n: number = 5): string {
    return getCommandHistory().formatForPrompt(n);
  }
}

