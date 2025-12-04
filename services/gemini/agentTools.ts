/**
 * Agent Tools
 * 
 * Comprehensive tool definitions for the omniscient agent.
 * Organized by capability: Navigation, Editing, Analysis, UI, Knowledge, Generation.
 */

import { Type, FunctionDeclaration } from '@google/genai';

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const NAVIGATION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'navigate_to_text',
    description: `Search for and navigate to specific text in the manuscript. Can search:
- Exact text matches
- Fuzzy matches (similar phrases)
- Character dialogue ("what did X say about Y")
- Character mentions (scenes where X appears)
Returns the found location and highlights it for the user.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { 
          type: Type.STRING, 
          description: 'Text or phrase to search for. For dialogue, include the quote or keywords.' 
        },
        searchType: { 
          type: Type.STRING, 
          enum: ['exact', 'fuzzy', 'dialogue', 'character_mention'],
          description: 'Type of search to perform. Default is fuzzy.'
        },
        character: { 
          type: Type.STRING, 
          description: 'For dialogue/mention searches, the character name to filter by' 
        },
        chapter: { 
          type: Type.STRING, 
          description: 'Optional: Limit search to a specific chapter by title' 
        }
      },
      required: ['query']
    }
  },
  {
    name: 'jump_to_chapter',
    description: 'Switch to a specific chapter by its title or number (1-indexed). The editor will load that chapter.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: { 
          type: Type.STRING, 
          description: 'Chapter title or number (e.g., "Chapter 3" or "3" or "The Beginning")' 
        }
      },
      required: ['identifier']
    }
  },
  {
    name: 'jump_to_scene',
    description: 'Navigate to the next or previous scene of a specific type from the current cursor position.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sceneType: { 
          type: Type.STRING, 
          enum: ['action', 'dialogue', 'exposition', 'transition', 'climax', 'any'],
          description: 'The type of scene to find' 
        },
        direction: { 
          type: Type.STRING, 
          enum: ['next', 'previous'],
          description: 'Direction from current cursor position' 
        }
      },
      required: ['sceneType', 'direction']
    }
  },
  {
    name: 'scroll_to_position',
    description: 'Scroll the editor to a specific character position in the text.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        position: { 
          type: Type.NUMBER, 
          description: 'Character offset to scroll to' 
        }
      },
      required: ['position']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// EDITING TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const EDITING_TOOLS: FunctionDeclaration[] = [
  {
    name: 'update_manuscript',
    description: `Replace specific text in the ACTIVE CHAPTER with new content. 
IMPORTANT: The searchText must match exactly what exists in the document.
Use this for: rewrites, fixes, expansions, or any text modification.
The change will be shown to the user for review before applying.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchText: {
          type: Type.STRING,
          description: 'The exact text in the manuscript to be replaced. Must match precisely.'
        },
        replacementText: {
          type: Type.STRING,
          description: 'The new text to insert in place of searchText.'
        },
        description: { 
          type: Type.STRING, 
          description: 'Brief description of what this change accomplishes (e.g., "Clarified the motivation")' 
        }
      },
        required: ['searchText', 'replacementText', 'description']
    }
  },
  {
    name: 'append_to_manuscript',
    description: 'Add new text to the end of the ACTIVE CHAPTER. Use for continuing the story or adding new content.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'The text to append to the chapter.'
        },
        description: { 
          type: Type.STRING, 
          description: 'Brief description of what was added.' 
        }
      },
        required: ['text', 'description']
    }
  },
  {
    name: 'insert_at_cursor',
    description: 'Insert text at the current cursor position.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { 
          type: Type.STRING, 
          description: 'Text to insert at cursor' 
        },
        description: { 
          type: Type.STRING, 
          description: 'Brief description of insertion' 
        }
      },
      required: ['text', 'description']
    }
  },
  {
    name: 'undo_last_change',
    description: 'Revert the manuscript to the previous version. Undoes the most recent edit.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'redo_last_change',
    description: 'Re-apply a previously undone change.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'create_branch',
    description: 'Create a new version branch from the current chapter state. Useful for experimental changes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { 
          type: Type.STRING, 
          description: 'Name for the new branch (e.g., "alternate-ending")' 
        }
      },
      required: ['name']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const ANALYSIS_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_critique_for_selection',
    description: `Get detailed writing feedback for the currently selected text (or text at cursor if no selection).
Focuses on specific aspects of the writing.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: { 
          type: Type.STRING, 
          enum: ['prose', 'pacing', 'dialogue', 'clarity', 'tension', 'all'],
          description: 'What aspect to focus the critique on. Default is "all".' 
        }
      }
    }
  },
  {
    name: 'explain_plot_issue',
    description: 'Get a detailed explanation of a specific plot issue from the analysis results.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        issueIndex: {
          type: Type.NUMBER,
          description: 'Index (0-based) of the plot issue to explain'
        }
      },
      required: ['issueIndex']
    }
  },
  {
    name: 'run_analysis',
    description: 'Run AI analysis on the current chapter. Can run full analysis or specific sections.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        section: { 
          type: Type.STRING, 
          enum: ['pacing', 'characters', 'plot', 'setting', 'full'],
          description: 'Which analysis to run. Default is "full".' 
        }
      }
    }
  },
  {
    name: 'get_pacing_at_cursor',
    description: 'Get detailed pacing analysis for the scene or paragraph at the current cursor position.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'check_contradiction',
    description: 'Check if specific text contradicts established facts about a character or the world.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { 
          type: Type.STRING, 
          description: 'The text to check for contradictions' 
        },
        entity: { 
          type: Type.STRING, 
          description: 'Optional: Specific character or world element to check against' 
        }
      },
      required: ['text']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// UI CONTROL TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const UI_CONTROL_TOOLS: FunctionDeclaration[] = [
  {
    name: 'switch_panel',
    description: 'Open a specific sidebar panel in the interface.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        panel: { 
          type: Type.STRING, 
          enum: ['analysis', 'chapters', 'graph', 'lore', 'history', 'chat', 'branches'],
          description: 'The panel to open' 
        }
      },
      required: ['panel']
    }
  },
  {
    name: 'highlight_text',
    description: 'Highlight a specific range of text to draw user attention.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start: { 
          type: Type.NUMBER, 
          description: 'Start position (character offset)' 
        },
        end: { 
          type: Type.NUMBER, 
          description: 'End position (character offset)' 
        },
        style: { 
          type: Type.STRING, 
          enum: ['warning', 'suggestion', 'info', 'error'],
          description: 'Visual style of the highlight' 
        }
      },
      required: ['start', 'end']
    }
  },
  {
    name: 'set_selection',
    description: 'Set the editor selection to a specific range to prime edits or critiques.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start: {
          type: Type.NUMBER,
          description: 'Start position (character offset) of the selection'
        },
        end: {
          type: Type.NUMBER,
          description: 'End position (character offset) of the selection'
        },
        text: {
          type: Type.STRING,
          description: 'Optional text preview to confirm the correct span'
        }
      },
      required: ['start', 'end']
    }
  },
  {
    name: 'toggle_zen_mode',
    description: 'Enter or exit distraction-free writing mode (Zen Mode). Hides all panels.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'switch_view',
    description: 'Switch between Editor view and Storyboard view.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        view: { 
          type: Type.STRING, 
          enum: ['editor', 'storyboard'],
          description: 'The view to switch to' 
        }
      },
      required: ['view']
    }
  },
  {
    name: 'show_character_in_graph',
    description: 'Open the Knowledge Graph and focus on a specific character.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        character_name: { 
          type: Type.STRING, 
          description: 'Name of the character to focus on' 
        }
      },
      required: ['character_name']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWLEDGE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'query_lore',
    description: `Query the Lore Bible for information about the story world.
Ask natural language questions like "What are Sarah's relationships?" or "What rules govern magic?"`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { 
          type: Type.STRING, 
          description: 'Natural language question about characters, world rules, or relationships' 
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_character_info',
    description: 'Get all known information about a specific character from the Lore Bible and analysis.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { 
          type: Type.STRING, 
          description: 'Character name' 
        }
      },
      required: ['name']
    }
  },
  {
    name: 'get_timeline_context',
    description: 'Get timeline events and causal chains relative to the current cursor position.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        range: { 
          type: Type.STRING, 
          enum: ['before', 'after', 'nearby', 'all'],
          description: 'Temporal range to query. "nearby" shows events close to cursor.' 
        }
      }
    }
  },
  {
    name: 'get_relationships',
    description: 'Get the relationship network for a character or between two characters.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        character1: { 
          type: Type.STRING, 
          description: 'First character name' 
        },
        character2: { 
          type: Type.STRING, 
          description: 'Optional: Second character to find relationship between' 
        }
      },
      required: ['character1']
    }
  },
  {
    name: 'get_open_plot_threads',
    description: 'List all unresolved plot threads and promises in the manuscript.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const MEMORY_TOOLS: FunctionDeclaration[] = [
  {
    name: 'write_memory_note',
    description: `Save an observation, decision, or preference to persistent memory.
Use this to remember:
- Story decisions ("Seth's motivation is guilt over past failure")
- Character issues ("Sarah's dialogue feels inconsistent in Act 2")
- Author preferences ("User prefers concise suggestions")
- Plot observations ("Foreshadowing setup in chapter 3 needs payoff")
Notes persist across sessions and inform future interactions.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'The content of the memory note'
        },
        type: {
          type: Type.STRING,
          enum: ['observation', 'issue', 'fact', 'plan', 'preference'],
          description: 'Type of note: observation (noticed something), issue (problem to fix), fact (established truth), plan (action item), preference (user style preference)'
        },
        scope: {
          type: Type.STRING,
          enum: ['project', 'author'],
          description: 'project = this manuscript only, author = applies to all projects (user preferences)'
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Tags for retrieval, e.g. ["character:seth", "act2", "dialogue"]. Use character:name format for character-specific notes.'
        },
        importance: {
          type: Type.NUMBER,
          description: 'Importance score 0-1. Higher = surfaces more often in context. Default 0.5.'
        }
      },
      required: ['text', 'type', 'scope']
    }
  },
  {
    name: 'search_memory',
    description: 'Search stored memories by tags or type. Use to recall previous observations, decisions, or issues.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Tags to search for (OR search - matches any tag)'
        },
        type: {
          type: Type.STRING,
          enum: ['observation', 'issue', 'fact', 'plan', 'preference'],
          description: 'Filter by note type'
        },
        scope: {
          type: Type.STRING,
          enum: ['project', 'author', 'all'],
          description: 'Which scope to search. Default is all.'
        }
      }
    }
  },
  {
    name: 'update_memory_note',
    description: 'Update an existing memory note. Use to refine observations or mark issues as resolved.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'ID of the note to update'
        },
        text: {
          type: Type.STRING,
          description: 'New text content (optional)'
        },
        importance: {
          type: Type.NUMBER,
          description: 'New importance score 0-1 (optional)'
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'New tags to replace existing (optional)'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_memory_note',
    description: 'Delete a memory note that is no longer relevant.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'ID of the note to delete'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'create_goal',
    description: `Create a tracked goal for this project. Goals persist across sessions and help maintain focus.
Examples: "Fix Seth's character arc", "Resolve Act 2 pacing issues", "Complete chapter 5 revision"`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Short title for the goal'
        },
        description: {
          type: Type.STRING,
          description: 'Detailed description of what needs to be accomplished'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'update_goal',
    description: 'Update goal progress or status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'ID of the goal to update'
        },
        progress: {
          type: Type.NUMBER,
          description: 'Progress percentage 0-100'
        },
        status: {
          type: Type.STRING,
          enum: ['active', 'completed', 'abandoned'],
          description: 'New status'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'watch_entity',
    description: 'Add a character or element to the watchlist for proactive monitoring. The agent will surface relevant notes when you work on chapters containing this entity.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Name of the character or element to watch'
        },
        reason: {
          type: Type.STRING,
          description: 'Why this entity should be watched (e.g., "Has unresolved arc issues")'
        },
        priority: {
          type: Type.STRING,
          enum: ['low', 'medium', 'high'],
          description: 'Priority level for surfacing suggestions. Default medium.'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'update_bedside_note',
    description: `Update the bedside-note planning memory with structured content.
Use this after meaningful events (analysis results, major edits, goal changes).
Choose the section to update, the action to take, and provide the content to set/append/remove.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        section: {
          type: Type.STRING,
          enum: [
            'currentFocus',
            'warnings',
            'activeGoals',
            'nextSteps',
            'openQuestions',
            'recentDiscoveries',
          ],
          description: 'Bedside-note section to update',
        },
        action: {
          type: Type.STRING,
          enum: ['set', 'append', 'remove'],
          description: 'How to apply the content to the section',
        },
        content: {
          type: Type.STRING,
          description:
            'Content to apply. For activeGoals, pass a title or JSON object {"title": "...", "progress": 50}. For list sections, provide bullet text.'
        },
      },
      required: ['section', 'action', 'content'],
    },
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const GENERATION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'rewrite_selection',
    description: `Generate alternative versions of the selected text. 
Shows multiple variations for the user to choose from.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { 
          type: Type.STRING, 
          enum: ['clarify', 'expand', 'condense', 'vary', 'intensify', 'tone_shift'],
          description: 'How to transform the text' 
        },
        targetTone: {
          type: Type.STRING,
          description: 'For tone_shift mode: the target emotional tone (e.g., "somber", "hopeful")'
        }
      },
      required: ['mode']
    }
  },
  {
    name: 'continue_writing',
    description: 'Generate continuation text from the current cursor position, matching the established style.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        direction: { 
          type: Type.STRING, 
          enum: ['continue', 'bridge_to_next_scene', 'complete_thought'],
          description: 'How to continue' 
        },
        length: { 
          type: Type.STRING, 
          enum: ['sentence', 'paragraph', 'long'],
          description: 'Approximate length of generation' 
        }
      }
    }
  },
  {
    name: 'suggest_dialogue',
    description: 'Generate dialogue options for a specific character in the current context.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        character: { 
          type: Type.STRING, 
          description: 'Character who will speak' 
        },
        emotion: { 
          type: Type.STRING, 
          description: 'Emotional state (e.g., "angry", "conflicted", "hopeful")' 
        },
        purpose: { 
          type: Type.STRING, 
          description: 'What the dialogue should accomplish narratively' 
        }
      },
      required: ['character']
    }
  },
  {
    name: 'generate_scene_beat',
    description: 'Generate a brief scene beat or transition to connect narrative moments.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fromState: {
          type: Type.STRING,
          description: 'Starting emotional/narrative state'
        },
        toState: {
          type: Type.STRING,
          description: 'Ending emotional/narrative state'
        },
        beatType: {
          type: Type.STRING,
          enum: ['action', 'reaction', 'transition', 'revelation'],
          description: 'Type of beat to generate'
        }
      },
      required: ['beatType']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

/** All agent tools combined */
export const ALL_AGENT_TOOLS: FunctionDeclaration[] = [
  ...NAVIGATION_TOOLS,
  ...EDITING_TOOLS,
  ...ANALYSIS_TOOLS,
  ...UI_CONTROL_TOOLS,
  ...KNOWLEDGE_TOOLS,
  ...GENERATION_TOOLS,
  ...MEMORY_TOOLS,
];

/** Tools safe for voice mode (no destructive edits without confirmation) */
export const VOICE_SAFE_TOOLS: FunctionDeclaration[] = [
  ...NAVIGATION_TOOLS,
  ...ANALYSIS_TOOLS.filter(t => !['run_analysis'].includes(t.name)),
  ...UI_CONTROL_TOOLS.filter(t => !['highlight_text'].includes(t.name)),
  ...KNOWLEDGE_TOOLS,
];

/** Minimal tool set for quick interactions */
export const QUICK_TOOLS: FunctionDeclaration[] = [
  NAVIGATION_TOOLS.find(t => t.name === 'navigate_to_text')!,
  NAVIGATION_TOOLS.find(t => t.name === 'jump_to_chapter')!,
  EDITING_TOOLS.find(t => t.name === 'update_manuscript')!,
  EDITING_TOOLS.find(t => t.name === 'undo_last_change')!,
  KNOWLEDGE_TOOLS.find(t => t.name === 'get_character_info')!,
];

/**
 * Get tools by category
 */
export const getToolsByCategory = (category: 'navigation' | 'editing' | 'analysis' | 'ui' | 'knowledge' | 'generation' | 'memory'): FunctionDeclaration[] => {
  switch (category) {
    case 'navigation': return NAVIGATION_TOOLS;
    case 'editing': return EDITING_TOOLS;
    case 'analysis': return ANALYSIS_TOOLS;
    case 'ui': return UI_CONTROL_TOOLS;
    case 'knowledge': return KNOWLEDGE_TOOLS;
    case 'generation': return GENERATION_TOOLS;
    case 'memory': return MEMORY_TOOLS;
  }
};
