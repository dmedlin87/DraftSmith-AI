/**
 * Memory Tool Handlers
 * 
 * Maps memory-related agent tool calls to the memory service layer.
 * Designed to be merged with other tool handlers in the agent service.
 */

import {
  createMemory,
  getMemories,
  updateMemory,
  deleteMemory,
  addGoal,
  updateGoal,
  addWatchedEntity,
} from '../memory';
import { MemoryNoteType, MemoryScope } from '../memory/types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryToolContext {
  projectId: string;
}

export type MemoryToolHandler = (
  args: Record<string, unknown>,
  context: MemoryToolContext
) => Promise<string>;

// ─────────────────────────────────────────────────────────────────────────────
// TOOL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * write_memory_note - Save an observation, decision, or preference
 */
const handleWriteMemoryNote: MemoryToolHandler = async (args, context) => {
  const { text, type, scope, tags, importance } = args as {
    text: string;
    type: MemoryNoteType;
    scope: MemoryScope;
    tags?: string[];
    importance?: number;
  };

  if (!text || !type || !scope) {
    return 'Error: Missing required fields (text, type, scope)';
  }

  try {
    const memory = await createMemory({
      text,
      type,
      scope,
      projectId: scope === 'project' ? context.projectId : undefined,
      topicTags: tags || [],
      importance: importance ?? 0.5,
    });

    return `✓ Memory saved (ID: ${memory.id.slice(0, 8)}...)\nType: ${type}\nScope: ${scope}\nTags: ${(tags || []).join(', ') || 'none'}`;
  } catch (error) {
    console.error('[memoryToolHandlers] write_memory_note error:', error);
    return `Error saving memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

/**
 * search_memory - Search stored memories by tags or type
 */
const handleSearchMemory: MemoryToolHandler = async (args, context) => {
  const { tags, type, scope } = args as {
    tags?: string[];
    type?: MemoryNoteType;
    scope?: 'project' | 'author' | 'all';
  };

  try {
    let results: Awaited<ReturnType<typeof getMemories>> = [];

    // If scope is 'all' or undefined, search both
    if (!scope || scope === 'all') {
      const [authorMemories, projectMemories] = await Promise.all([
        getMemories({ scope: 'author', type, topicTags: tags, limit: 15 }),
        getMemories({ scope: 'project', projectId: context.projectId, type, topicTags: tags, limit: 15 }),
      ]);
      results = [...authorMemories, ...projectMemories];
    } else if (scope === 'author') {
      results = await getMemories({ scope: 'author', type, topicTags: tags, limit: 25 });
    } else {
      results = await getMemories({ 
        scope: 'project', 
        projectId: context.projectId, 
        type, 
        topicTags: tags, 
        limit: 25 
      });
    }

    if (results.length === 0) {
      return 'No memories found matching the criteria.';
    }

    // Format results
    const formatted = results
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20)
      .map((m, i) => {
        const tagStr = m.topicTags.length > 0 ? ` [${m.topicTags.join(', ')}]` : '';
        const date = new Date(m.createdAt).toLocaleDateString();
        return `${i + 1}. [${m.type.toUpperCase()}] (${m.scope}) ${m.text.slice(0, 100)}...${tagStr}\n   ID: ${m.id} | Created: ${date} | Importance: ${m.importance}`;
      })
      .join('\n\n');

    return `Found ${results.length} memories:\n\n${formatted}`;
  } catch (error) {
    console.error('[memoryToolHandlers] search_memory error:', error);
    return `Error searching memories: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

/**
 * update_memory_note - Update an existing memory note
 */
const handleUpdateMemoryNote: MemoryToolHandler = async (args) => {
  const { id, text, importance, tags } = args as {
    id: string;
    text?: string;
    importance?: number;
    tags?: string[];
  };

  if (!id) {
    return 'Error: Memory ID is required';
  }

  try {
    const updates: Parameters<typeof updateMemory>[1] = {};
    if (text !== undefined) updates.text = text;
    if (importance !== undefined) updates.importance = importance;
    if (tags !== undefined) updates.topicTags = tags;

    if (Object.keys(updates).length === 0) {
      return 'No updates provided. Specify text, importance, or tags to update.';
    }

    const updated = await updateMemory(id, updates);
    
    if (!updated) {
      return `Memory with ID "${id}" not found.`;
    }

    return `✓ Memory updated (ID: ${id.slice(0, 8)}...)\nUpdated fields: ${Object.keys(updates).join(', ')}`;
  } catch (error) {
    console.error('[memoryToolHandlers] update_memory_note error:', error);
    return `Error updating memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

/**
 * delete_memory_note - Delete a memory note
 */
const handleDeleteMemoryNote: MemoryToolHandler = async (args) => {
  const { id } = args as { id: string };

  if (!id) {
    return 'Error: Memory ID is required';
  }

  try {
    await deleteMemory(id);
    return `✓ Memory deleted (ID: ${id.slice(0, 8)}...)`;
  } catch (error) {
    console.error('[memoryToolHandlers] delete_memory_note error:', error);
    return `Error deleting memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

/**
 * create_goal - Create a tracked goal for the project
 */
const handleCreateGoal: MemoryToolHandler = async (args, context) => {
  const { title, description } = args as {
    title: string;
    description?: string;
  };

  if (!title) {
    return 'Error: Goal title is required';
  }

  try {
    const goal = await addGoal({
      projectId: context.projectId,
      title,
      description,
      status: 'active',
    });

    return `✓ Goal created (ID: ${goal.id.slice(0, 8)}...)\nTitle: "${title}"\nStatus: active\nProgress: 0%`;
  } catch (error) {
    console.error('[memoryToolHandlers] create_goal error:', error);
    return `Error creating goal: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

/**
 * update_goal - Update goal progress or status
 */
const handleUpdateGoal: MemoryToolHandler = async (args) => {
  const { id, progress, status } = args as {
    id: string;
    progress?: number;
    status?: 'active' | 'completed' | 'abandoned';
  };

  if (!id) {
    return 'Error: Goal ID is required';
  }

  try {
    const updates: Parameters<typeof updateGoal>[1] = {};
    if (progress !== undefined) updates.progress = Math.min(100, Math.max(0, progress));
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return 'No updates provided. Specify progress or status to update.';
    }

    const updated = await updateGoal(id, updates);
    
    if (!updated) {
      return `Goal with ID "${id}" not found.`;
    }

    const statusEmoji = updated.status === 'completed' ? '✅' : 
                        updated.status === 'abandoned' ? '❌' : '🎯';
    
    return `${statusEmoji} Goal updated (ID: ${id.slice(0, 8)}...)\nStatus: ${updated.status}\nProgress: ${updated.progress}%`;
  } catch (error) {
    console.error('[memoryToolHandlers] update_goal error:', error);
    return `Error updating goal: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

/**
 * watch_entity - Add a character or element to the watchlist
 */
const handleWatchEntity: MemoryToolHandler = async (args, context) => {
  const { name, reason, priority } = args as {
    name: string;
    reason?: string;
    priority?: 'low' | 'medium' | 'high';
  };

  if (!name) {
    return 'Error: Entity name is required';
  }

  try {
    const entity = await addWatchedEntity({
      projectId: context.projectId,
      name,
      reason,
      priority: priority || 'medium',
    });

    return `👁️ Now watching "${name}" (ID: ${entity.id.slice(0, 8)}...)\nPriority: ${entity.priority}\nReason: ${reason || 'No reason specified'}`;
  } catch (error) {
    console.error('[memoryToolHandlers] watch_entity error:', error);
    return `Error adding to watchlist: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER MAP & FACTORY
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_TOOL_HANDLERS: Record<string, MemoryToolHandler> = {
  write_memory_note: handleWriteMemoryNote,
  search_memory: handleSearchMemory,
  update_memory_note: handleUpdateMemoryNote,
  delete_memory_note: handleDeleteMemoryNote,
  create_goal: handleCreateGoal,
  update_goal: handleUpdateGoal,
  watch_entity: handleWatchEntity,
};

/**
 * Check if a tool name is a memory tool
 */
export const isMemoryTool = (toolName: string): boolean => {
  return toolName in MEMORY_TOOL_HANDLERS;
};

/**
 * Get all memory tool names
 */
export const getMemoryToolNames = (): string[] => {
  return Object.keys(MEMORY_TOOL_HANDLERS);
};

/**
 * Execute a memory tool by name
 * @returns Result string, or null if not a memory tool
 */
export const executeMemoryTool = async (
  toolName: string,
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<string | null> => {
  const handler = MEMORY_TOOL_HANDLERS[toolName];
  
  if (!handler) {
    return null; // Not a memory tool
  }

  return handler(args, context);
};

/**
 * Create a tool action handler that includes memory tools
 * Wraps an existing handler to add memory tool support
 */
export const withMemoryTools = (
  existingHandler: (toolName: string, args: Record<string, unknown>) => Promise<string>,
  getProjectId: () => string | null
): ((toolName: string, args: Record<string, unknown>) => Promise<string>) => {
  return async (toolName: string, args: Record<string, unknown>) => {
    // Check if it's a memory tool
    if (isMemoryTool(toolName)) {
      const projectId = getProjectId();
      
      if (!projectId) {
        return 'Error: No project loaded. Memory tools require an active project.';
      }

      const result = await executeMemoryTool(toolName, args, { projectId });
      return result ?? 'Error: Unknown memory tool';
    }

    // Fall through to existing handler
    return existingHandler(toolName, args);
  };
};
