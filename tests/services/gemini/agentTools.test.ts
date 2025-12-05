/**
 * Agent Tools Test Suite
 *
 * Comprehensive tests for agent tool definitions and organization
 */

import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_TOOLS,
  EDITING_TOOLS,
  ANALYSIS_TOOLS,
  UI_CONTROL_TOOLS,
  KNOWLEDGE_TOOLS,
  GENERATION_TOOLS,
  MEMORY_TOOLS,
  ALL_AGENT_TOOLS,
  VOICE_SAFE_TOOLS,
  QUICK_TOOLS,
  getToolsByCategory,
} from '@/services/gemini/agentTools';
import { Type, FunctionDeclaration } from '@google/genai';

const ALL_GROUPS = [
  NAVIGATION_TOOLS,
  EDITING_TOOLS,
  ANALYSIS_TOOLS,
  UI_CONTROL_TOOLS,
  KNOWLEDGE_TOOLS,
  GENERATION_TOOLS,
  MEMORY_TOOLS,
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const validateToolStructure = (tool: FunctionDeclaration) => {
  expect(tool).toHaveProperty('name');
  expect(tool).toHaveProperty('description');
  expect(tool).toHaveProperty('parameters');
  expect(typeof tool.name).toBe('string');
  expect(typeof tool.description).toBe('string');
  expect(tool.parameters).toHaveProperty('type');
  expect(tool.parameters.type).toBe(Type.OBJECT);
};

const findTool = (tools: FunctionDeclaration[], name: string) => {
  return tools.find(t => t.name === name);
};

// ─────────────────────────────────────────────────────────────────────────────
// BASIC STRUCTURE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('agentTools', () => {
  it('ensures each tool has a basic schema', () => {
    for (const group of ALL_GROUPS) {
      for (const tool of group) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('OBJECT');
      }
    }
  });

  it('ALL_AGENT_TOOLS aggregates all category tools without duplicates', () => {
    const expectedCount = ALL_GROUPS.reduce((sum, group) => sum + group.length, 0);
    expect(ALL_AGENT_TOOLS).toHaveLength(expectedCount);

    const names = ALL_AGENT_TOOLS.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('VOICE_SAFE_TOOLS excludes destructive or high-risk tools', () => {
    const allowedSourceNames = new Set(
      [
        ...NAVIGATION_TOOLS,
        ...ANALYSIS_TOOLS,
        ...UI_CONTROL_TOOLS,
        ...KNOWLEDGE_TOOLS,
      ].map((t) => t.name),
    );

    const disallowedNames = new Set([
      ...EDITING_TOOLS,
      ...GENERATION_TOOLS,
      ...MEMORY_TOOLS,
    ].map((t) => t.name));

    disallowedNames.add('run_analysis');
    disallowedNames.add('highlight_text');

    for (const tool of VOICE_SAFE_TOOLS) {
      expect(allowedSourceNames.has(tool.name)).toBe(true);
      expect(disallowedNames.has(tool.name)).toBe(false);
    }
  });

  it('QUICK_TOOLS exposes a minimal, high-value subset', () => {
    const quickNames = QUICK_TOOLS.map((t) => t.name);

    expect(quickNames).toEqual([
      'navigate_to_text',
      'jump_to_chapter',
      'update_manuscript',
      'undo_last_change',
      'get_character_info',
    ]);

    for (const tool of QUICK_TOOLS) {
      expect(ALL_AGENT_TOOLS.some((t) => t.name === tool.name)).toBe(true);
    }
  });

  it('getToolsByCategory returns the correct groups', () => {
    expect(getToolsByCategory('navigation')).toBe(NAVIGATION_TOOLS);
    expect(getToolsByCategory('editing')).toBe(EDITING_TOOLS);
    expect(getToolsByCategory('analysis')).toBe(ANALYSIS_TOOLS);
    expect(getToolsByCategory('ui')).toBe(UI_CONTROL_TOOLS);
    expect(getToolsByCategory('knowledge')).toBe(KNOWLEDGE_TOOLS);
    expect(getToolsByCategory('generation')).toBe(GENERATION_TOOLS);
    expect(getToolsByCategory('memory')).toBe(MEMORY_TOOLS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('NAVIGATION_TOOLS', () => {
  it('should have 4 navigation tools', () => {
    expect(NAVIGATION_TOOLS).toHaveLength(4);
  });

  it('should have valid structure for all tools', () => {
    NAVIGATION_TOOLS.forEach(validateToolStructure);
  });

  describe('navigate_to_text', () => {
    const tool = findTool(NAVIGATION_TOOLS, 'navigate_to_text');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have required query parameter', () => {
      expect(tool?.parameters.required).toContain('query');
    });

    it('should have searchType enum', () => {
      const searchType = tool?.parameters.properties?.searchType;
      expect(searchType).toBeDefined();
      expect(searchType.enum).toEqual(['exact', 'fuzzy', 'dialogue', 'character_mention']);
    });

    it('should have optional character and chapter parameters', () => {
      expect(tool?.parameters.properties).toHaveProperty('character');
      expect(tool?.parameters.properties).toHaveProperty('chapter');
    });
  });

  describe('jump_to_chapter', () => {
    const tool = findTool(NAVIGATION_TOOLS, 'jump_to_chapter');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have required identifier parameter', () => {
      expect(tool?.parameters.required).toContain('identifier');
    });
  });

  describe('jump_to_scene', () => {
    const tool = findTool(NAVIGATION_TOOLS, 'jump_to_scene');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have sceneType enum', () => {
      const sceneType = tool?.parameters.properties?.sceneType;
      expect(sceneType?.enum).toContain('action');
      expect(sceneType?.enum).toContain('dialogue');
      expect(sceneType?.enum).toContain('exposition');
      expect(sceneType?.enum).toContain('any');
    });

    it('should have direction enum', () => {
      const direction = tool?.parameters.properties?.direction;
      expect(direction?.enum).toEqual(['next', 'previous']);
    });

    it('should require both sceneType and direction', () => {
      expect(tool?.parameters.required).toContain('sceneType');
      expect(tool?.parameters.required).toContain('direction');
    });
  });

  describe('scroll_to_position', () => {
    const tool = findTool(NAVIGATION_TOOLS, 'scroll_to_position');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have position parameter as number', () => {
      const position = tool?.parameters.properties?.position;
      expect(position?.type).toBe(Type.NUMBER);
    });

    it('should require position', () => {
      expect(tool?.parameters.required).toContain('position');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDITING TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('EDITING_TOOLS', () => {
  it('should have 6 editing tools', () => {
    expect(EDITING_TOOLS).toHaveLength(6);
  });

  it('should have valid structure for all tools', () => {
    EDITING_TOOLS.forEach(validateToolStructure);
  });

  describe('update_manuscript', () => {
    const tool = findTool(EDITING_TOOLS, 'update_manuscript');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require searchText, replacementText, and description', () => {
      expect(tool?.parameters.required).toContain('searchText');
      expect(tool?.parameters.required).toContain('replacementText');
      expect(tool?.parameters.required).toContain('description');
    });

    it('should have all parameters as strings', () => {
      expect(tool?.parameters.properties?.searchText.type).toBe(Type.STRING);
      expect(tool?.parameters.properties?.replacementText.type).toBe(Type.STRING);
      expect(tool?.parameters.properties?.description.type).toBe(Type.STRING);
    });
  });

  describe('append_to_manuscript', () => {
    const tool = findTool(EDITING_TOOLS, 'append_to_manuscript');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require text and description', () => {
      expect(tool?.parameters.required).toContain('text');
      expect(tool?.parameters.required).toContain('description');
    });
  });

  describe('insert_at_cursor', () => {
    const tool = findTool(EDITING_TOOLS, 'insert_at_cursor');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require text and description', () => {
      expect(tool?.parameters.required).toContain('text');
      expect(tool?.parameters.required).toContain('description');
    });
  });

  describe('undo_last_change', () => {
    const tool = findTool(EDITING_TOOLS, 'undo_last_change');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have empty parameters', () => {
      expect(Object.keys(tool?.parameters.properties || {})).toHaveLength(0);
    });
  });

  describe('redo_last_change', () => {
    const tool = findTool(EDITING_TOOLS, 'redo_last_change');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have empty parameters', () => {
      expect(Object.keys(tool?.parameters.properties || {})).toHaveLength(0);
    });
  });

  describe('create_branch', () => {
    const tool = findTool(EDITING_TOOLS, 'create_branch');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require name parameter', () => {
      expect(tool?.parameters.required).toContain('name');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('ANALYSIS_TOOLS', () => {
  it('should have 5 analysis tools', () => {
    expect(ANALYSIS_TOOLS).toHaveLength(5);
  });

  it('should have valid structure for all tools', () => {
    ANALYSIS_TOOLS.forEach(validateToolStructure);
  });

  describe('get_critique_for_selection', () => {
    const tool = findTool(ANALYSIS_TOOLS, 'get_critique_for_selection');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have focus enum', () => {
      const focus = tool?.parameters.properties?.focus;
      expect(focus?.enum).toContain('prose');
      expect(focus?.enum).toContain('pacing');
      expect(focus?.enum).toContain('dialogue');
      expect(focus?.enum).toContain('clarity');
      expect(focus?.enum).toContain('tension');
      expect(focus?.enum).toContain('all');
    });
  });

  describe('explain_plot_issue', () => {
    const tool = findTool(ANALYSIS_TOOLS, 'explain_plot_issue');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require issueIndex parameter', () => {
      expect(tool?.parameters.required).toContain('issueIndex');
    });

    it('should have issueIndex as number', () => {
      expect(tool?.parameters.properties?.issueIndex.type).toBe(Type.NUMBER);
    });
  });

  describe('run_analysis', () => {
    const tool = findTool(ANALYSIS_TOOLS, 'run_analysis');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have section enum', () => {
      const section = tool?.parameters.properties?.section;
      expect(section?.enum).toContain('pacing');
      expect(section?.enum).toContain('characters');
      expect(section?.enum).toContain('plot');
      expect(section?.enum).toContain('setting');
      expect(section?.enum).toContain('full');
    });
  });

  describe('get_pacing_at_cursor', () => {
    const tool = findTool(ANALYSIS_TOOLS, 'get_pacing_at_cursor');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have empty parameters', () => {
      expect(Object.keys(tool?.parameters.properties || {})).toHaveLength(0);
    });
  });

  describe('check_contradiction', () => {
    const tool = findTool(ANALYSIS_TOOLS, 'check_contradiction');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require text parameter', () => {
      expect(tool?.parameters.required).toContain('text');
    });

    it('should have optional entity parameter', () => {
      expect(tool?.parameters.properties).toHaveProperty('entity');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI CONTROL TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('UI_CONTROL_TOOLS', () => {
  it('should have 6 UI control tools', () => {
    expect(UI_CONTROL_TOOLS).toHaveLength(6);
  });

  it('should have valid structure for all tools', () => {
    UI_CONTROL_TOOLS.forEach(validateToolStructure);
  });

  describe('switch_panel', () => {
    const tool = findTool(UI_CONTROL_TOOLS, 'switch_panel');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have panel enum with all panels', () => {
      const panel = tool?.parameters.properties?.panel;
      expect(panel?.enum).toContain('analysis');
      expect(panel?.enum).toContain('chapters');
      expect(panel?.enum).toContain('graph');
      expect(panel?.enum).toContain('lore');
      expect(panel?.enum).toContain('history');
      expect(panel?.enum).toContain('chat');
      expect(panel?.enum).toContain('branches');
    });

    it('should require panel parameter', () => {
      expect(tool?.parameters.required).toContain('panel');
    });
  });

  describe('highlight_text', () => {
    const tool = findTool(UI_CONTROL_TOOLS, 'highlight_text');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require start and end parameters', () => {
      expect(tool?.parameters.required).toContain('start');
      expect(tool?.parameters.required).toContain('end');
    });

    it('should have style enum', () => {
      const style = tool?.parameters.properties?.style;
      expect(style?.enum).toEqual(['warning', 'suggestion', 'info', 'error']);
    });
  });

  describe('set_selection', () => {
    const tool = findTool(UI_CONTROL_TOOLS, 'set_selection');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require start and end', () => {
      expect(tool?.parameters.required).toContain('start');
      expect(tool?.parameters.required).toContain('end');
    });

    it('should have optional text preview', () => {
      expect(tool?.parameters.properties).toHaveProperty('text');
    });
  });

  describe('toggle_zen_mode', () => {
    const tool = findTool(UI_CONTROL_TOOLS, 'toggle_zen_mode');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have empty parameters', () => {
      expect(Object.keys(tool?.parameters.properties || {})).toHaveLength(0);
    });
  });

  describe('switch_view', () => {
    const tool = findTool(UI_CONTROL_TOOLS, 'switch_view');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have view enum', () => {
      const view = tool?.parameters.properties?.view;
      expect(view?.enum).toEqual(['editor', 'storyboard']);
    });

    it('should require view parameter', () => {
      expect(tool?.parameters.required).toContain('view');
    });
  });

  describe('show_character_in_graph', () => {
    const tool = findTool(UI_CONTROL_TOOLS, 'show_character_in_graph');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require character_name', () => {
      expect(tool?.parameters.required).toContain('character_name');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('KNOWLEDGE_TOOLS', () => {
  it('should have 5 knowledge tools', () => {
    expect(KNOWLEDGE_TOOLS).toHaveLength(5);
  });

  it('should have valid structure for all tools', () => {
    KNOWLEDGE_TOOLS.forEach(validateToolStructure);
  });

  describe('query_lore', () => {
    const tool = findTool(KNOWLEDGE_TOOLS, 'query_lore');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require query parameter', () => {
      expect(tool?.parameters.required).toContain('query');
    });
  });

  describe('get_character_info', () => {
    const tool = findTool(KNOWLEDGE_TOOLS, 'get_character_info');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require name parameter', () => {
      expect(tool?.parameters.required).toContain('name');
    });
  });

  describe('get_timeline_context', () => {
    const tool = findTool(KNOWLEDGE_TOOLS, 'get_timeline_context');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have range enum', () => {
      const range = tool?.parameters.properties?.range;
      expect(range?.enum).toEqual(['before', 'after', 'nearby', 'all']);
    });
  });

  describe('get_relationships', () => {
    const tool = findTool(KNOWLEDGE_TOOLS, 'get_relationships');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require character1', () => {
      expect(tool?.parameters.required).toContain('character1');
    });

    it('should have optional character2', () => {
      expect(tool?.parameters.properties).toHaveProperty('character2');
    });
  });

  describe('get_open_plot_threads', () => {
    const tool = findTool(KNOWLEDGE_TOOLS, 'get_open_plot_threads');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have empty parameters', () => {
      expect(Object.keys(tool?.parameters.properties || {})).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('GENERATION_TOOLS', () => {
  it('should have 4 generation tools', () => {
    expect(GENERATION_TOOLS).toHaveLength(4);
  });

  it('should have valid structure for all tools', () => {
    GENERATION_TOOLS.forEach(validateToolStructure);
  });

  describe('rewrite_selection', () => {
    const tool = findTool(GENERATION_TOOLS, 'rewrite_selection');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require mode parameter', () => {
      expect(tool?.parameters.required).toContain('mode');
    });

    it('should have mode enum', () => {
      const mode = tool?.parameters.properties?.mode;
      expect(mode?.enum).toContain('clarify');
      expect(mode?.enum).toContain('expand');
      expect(mode?.enum).toContain('condense');
      expect(mode?.enum).toContain('vary');
      expect(mode?.enum).toContain('intensify');
      expect(mode?.enum).toContain('tone_shift');
    });

    it('should have optional targetTone for tone_shift', () => {
      expect(tool?.parameters.properties).toHaveProperty('targetTone');
    });
  });

  describe('continue_writing', () => {
    const tool = findTool(GENERATION_TOOLS, 'continue_writing');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have direction enum', () => {
      const direction = tool?.parameters.properties?.direction;
      expect(direction?.enum).toContain('continue');
      expect(direction?.enum).toContain('bridge_to_next_scene');
      expect(direction?.enum).toContain('complete_thought');
    });

    it('should have length enum', () => {
      const length = tool?.parameters.properties?.length;
      expect(length?.enum).toEqual(['sentence', 'paragraph', 'long']);
    });
  });

  describe('suggest_dialogue', () => {
    const tool = findTool(GENERATION_TOOLS, 'suggest_dialogue');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require character parameter', () => {
      expect(tool?.parameters.required).toContain('character');
    });

    it('should have optional emotion and purpose', () => {
      expect(tool?.parameters.properties).toHaveProperty('emotion');
      expect(tool?.parameters.properties).toHaveProperty('purpose');
    });
  });

  describe('generate_scene_beat', () => {
    const tool = findTool(GENERATION_TOOLS, 'generate_scene_beat');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require beatType', () => {
      expect(tool?.parameters.required).toContain('beatType');
    });

    it('should have beatType enum', () => {
      const beatType = tool?.parameters.properties?.beatType;
      expect(beatType?.enum).toEqual(['action', 'reaction', 'transition', 'revelation']);
    });

    it('should have optional fromState and toState', () => {
      expect(tool?.parameters.properties).toHaveProperty('fromState');
      expect(tool?.parameters.properties).toHaveProperty('toState');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY TOOLS DETAILED TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('MEMORY_TOOLS', () => {
  it('should have 8 memory tools', () => {
    expect(MEMORY_TOOLS).toHaveLength(8);
  });

  it('should have valid structure for all tools', () => {
    MEMORY_TOOLS.forEach(validateToolStructure);
  });

  describe('write_memory_note', () => {
    const tool = findTool(MEMORY_TOOLS, 'write_memory_note');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require text, type, and scope', () => {
      expect(tool?.parameters.required).toContain('text');
      expect(tool?.parameters.required).toContain('type');
      expect(tool?.parameters.required).toContain('scope');
    });

    it('should have type enum', () => {
      const type = tool?.parameters.properties?.type;
      expect(type?.enum).toEqual(['observation', 'issue', 'fact', 'plan', 'preference']);
    });

    it('should have scope enum', () => {
      const scope = tool?.parameters.properties?.scope;
      expect(scope?.enum).toEqual(['project', 'author']);
    });

    it('should have tags as array', () => {
      const tags = tool?.parameters.properties?.tags;
      expect(tags?.type).toBe(Type.ARRAY);
    });

    it('should have optional importance as number', () => {
      const importance = tool?.parameters.properties?.importance;
      expect(importance?.type).toBe(Type.NUMBER);
    });
  });

  describe('search_memory', () => {
    const tool = findTool(MEMORY_TOOLS, 'search_memory');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have optional tags, type, and scope', () => {
      expect(tool?.parameters.properties).toHaveProperty('tags');
      expect(tool?.parameters.properties).toHaveProperty('type');
      expect(tool?.parameters.properties).toHaveProperty('scope');
    });

    it('should not have required parameters', () => {
      expect(tool?.parameters.required || []).toHaveLength(0);
    });
  });

  describe('update_memory_note', () => {
    const tool = findTool(MEMORY_TOOLS, 'update_memory_note');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require id parameter', () => {
      expect(tool?.parameters.required).toContain('id');
    });

    it('should have optional text, importance, and tags', () => {
      expect(tool?.parameters.properties).toHaveProperty('text');
      expect(tool?.parameters.properties).toHaveProperty('importance');
      expect(tool?.parameters.properties).toHaveProperty('tags');
    });
  });

  describe('delete_memory_note', () => {
    const tool = findTool(MEMORY_TOOLS, 'delete_memory_note');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require id parameter', () => {
      expect(tool?.parameters.required).toContain('id');
    });
  });

  describe('create_goal', () => {
    const tool = findTool(MEMORY_TOOLS, 'create_goal');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require title', () => {
      expect(tool?.parameters.required).toContain('title');
    });

    it('should have optional description', () => {
      expect(tool?.parameters.properties).toHaveProperty('description');
    });
  });

  describe('update_goal', () => {
    const tool = findTool(MEMORY_TOOLS, 'update_goal');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require id', () => {
      expect(tool?.parameters.required).toContain('id');
    });

    it('should have status enum', () => {
      const status = tool?.parameters.properties?.status;
      expect(status?.enum).toEqual(['active', 'completed', 'abandoned']);
    });

    it('should have optional progress as number', () => {
      const progress = tool?.parameters.properties?.progress;
      expect(progress?.type).toBe(Type.NUMBER);
    });
  });

  describe('watch_entity', () => {
    const tool = findTool(MEMORY_TOOLS, 'watch_entity');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require name', () => {
      expect(tool?.parameters.required).toContain('name');
    });

    it('should have priority enum', () => {
      const priority = tool?.parameters.properties?.priority;
      expect(priority?.enum).toEqual(['low', 'medium', 'high']);
    });

    it('should have optional reason', () => {
      expect(tool?.parameters.properties).toHaveProperty('reason');
    });
  });

  describe('update_bedside_note', () => {
    const tool = findTool(MEMORY_TOOLS, 'update_bedside_note');

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require section, action, and content', () => {
      expect(tool?.parameters.required).toContain('section');
      expect(tool?.parameters.required).toContain('action');
      expect(tool?.parameters.required).toContain('content');
    });

    it('should have section enum', () => {
      const section = tool?.parameters.properties?.section;
      expect(section?.enum).toContain('currentFocus');
      expect(section?.enum).toContain('warnings');
      expect(section?.enum).toContain('activeGoals');
      expect(section?.enum).toContain('nextSteps');
      expect(section?.enum).toContain('openQuestions');
      expect(section?.enum).toContain('recentDiscoveries');
    });

    it('should have action enum', () => {
      const action = tool?.parameters.properties?.action;
      expect(action?.enum).toEqual(['set', 'append', 'remove']);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TOOL NAMING CONVENTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Tool naming conventions', () => {
  it('should use snake_case for all tool names', () => {
    ALL_AGENT_TOOLS.forEach(tool => {
      expect(tool.name).toMatch(/^[a-z_]+$/);
    });
  });

  it('should have descriptive names', () => {
    ALL_AGENT_TOOLS.forEach(tool => {
      expect(tool.name.length).toBeGreaterThan(3);
    });
  });

  it('should have descriptions that are non-empty strings', () => {
    ALL_AGENT_TOOLS.forEach(tool => {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARAMETER VALIDATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Parameter validation', () => {
  it('should have properties object for all tools', () => {
    ALL_AGENT_TOOLS.forEach(tool => {
      expect(tool.parameters).toHaveProperty('properties');
    });
  });

  it('should have type OBJECT for all parameters', () => {
    ALL_AGENT_TOOLS.forEach(tool => {
      expect(tool.parameters.type).toBe(Type.OBJECT);
    });
  });

  it('should have valid required arrays (if present)', () => {
    ALL_AGENT_TOOLS.forEach(tool => {
      if (tool.parameters.required) {
        expect(Array.isArray(tool.parameters.required)).toBe(true);

        // All required params should exist in properties
        tool.parameters.required.forEach((param: string) => {
          expect(tool.parameters.properties).toHaveProperty(param);
        });
      }
    });
  });
});
