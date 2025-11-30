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
IMPORTANT: The search_text must match exactly what exists in the document.
Use this for: rewrites, fixes, expansions, or any text modification.
The change will be shown to the user for review before applying.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        search_text: { 
          type: Type.STRING, 
          description: 'The exact text in the manuscript to be replaced. Must match precisely.' 
        },
        replacement_text: { 
          type: Type.STRING, 
          description: 'The new text to insert in place of search_text.' 
        },
        description: { 
          type: Type.STRING, 
          description: 'Brief description of what this change accomplishes (e.g., "Clarified the motivation")' 
        }
      },
      required: ['search_text', 'replacement_text', 'description']
    }
  },
  {
    name: 'append_to_manuscript',
    description: 'Add new text to the end of the ACTIVE CHAPTER. Use for continuing the story or adding new content.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text_to_add: { 
          type: Type.STRING, 
          description: 'The text to append to the chapter.' 
        },
        description: { 
          type: Type.STRING, 
          description: 'Brief description of what was added.' 
        }
      },
      required: ['text_to_add', 'description']
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
        issue_index: { 
          type: Type.NUMBER, 
          description: 'Index (0-based) of the plot issue to explain' 
        }
      },
      required: ['issue_index']
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
        target_tone: { 
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
        from_state: { 
          type: Type.STRING, 
          description: 'Starting emotional/narrative state' 
        },
        to_state: { 
          type: Type.STRING, 
          description: 'Ending emotional/narrative state' 
        },
        beat_type: { 
          type: Type.STRING, 
          enum: ['action', 'reaction', 'transition', 'revelation'],
          description: 'Type of beat to generate' 
        }
      },
      required: ['beat_type']
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
export const getToolsByCategory = (category: 'navigation' | 'editing' | 'analysis' | 'ui' | 'knowledge' | 'generation'): FunctionDeclaration[] => {
  switch (category) {
    case 'navigation': return NAVIGATION_TOOLS;
    case 'editing': return EDITING_TOOLS;
    case 'analysis': return ANALYSIS_TOOLS;
    case 'ui': return UI_CONTROL_TOOLS;
    case 'knowledge': return KNOWLEDGE_TOOLS;
    case 'generation': return GENERATION_TOOLS;
  }
};
