/**
 * Comprehensive tests for Gemini agent service
 * Covers rewriteText, getContextualHelp, createAgentSession, and agentTools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rewriteText,
  getContextualHelp,
  createAgentSessionLegacy as createAgentSession,
  agentTools,
  ALL_AGENT_TOOLS,
  QuillAgent,
  generateContinuation,
} from '@/services/gemini/agent';
import { 
  mockUsageMetadata,
  mockLore,
  mockAnalysisResult,
  createMockPersona,
  chaosResponses,
  createRateLimitError,
  createContextLengthError,
} from '@/tests/mocks/geminiClient';
import { AIError, RateLimitError, UnknownAIError } from '@/services/gemini/errors';

// Setup mocks using vi.hoisted() to ensure they're available at import time
const mockAi = vi.hoisted(() => ({
  models: {
    generateContent: vi.fn(),
  },
  chats: {
    create: vi.fn(),
  },
}));

// Mock the client module before any imports
vi.mock('@/services/gemini/client', () => ({
  ai: mockAi,
}));

// Mock resilient parser
// (Use real implementation for rewriteText tests; individual test cases may spy if needed.)

describe('agentTools configuration', () => {
  it('defines correct tool structure for update_manuscript', () => {
    const updateTool = agentTools.find(tool => tool.name === 'update_manuscript');
    
    expect(updateTool).toBeDefined();
    expect(updateTool?.description).toContain('ACTIVE CHAPTER');
    expect(updateTool?.parameters.type).toBe('OBJECT');
    expect(updateTool?.parameters.required).toEqual(['search_text', 'replacement_text', 'description']);
    expect(updateTool?.parameters.properties.search_text.type).toBe('STRING');
    expect(updateTool?.parameters.properties.replacement_text.type).toBe('STRING');
    expect(updateTool?.parameters.properties.description.type).toBe('STRING');
  });

  it('defines correct tool structure for append_to_manuscript', () => {
    const appendTool = agentTools.find(tool => tool.name === 'append_to_manuscript');
    
    expect(appendTool).toBeDefined();
    expect(appendTool?.description).toContain('very end of the ACTIVE CHAPTER');
    expect(appendTool?.parameters.required).toEqual(['text_to_add', 'description']);
  });

  it('defines correct tool structure for undo_last_change', () => {
    const undoTool = agentTools.find(tool => tool.name === 'undo_last_change');
    
    expect(undoTool).toBeDefined();
    expect(undoTool?.description).toContain('previous version');
    expect(undoTool?.parameters.required).toBeUndefined();
  });

  it('has exactly three tools defined', () => {
    expect(agentTools).toHaveLength(3);
    const toolNames = agentTools.map(tool => tool.name);
    expect(toolNames).toEqual(['update_manuscript', 'append_to_manuscript', 'undo_last_change']);
  });
});

describe('rewriteText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rewrites text with tone tuner mode', async () => {
    const mockResponse = {
      text: JSON.stringify({
        variations: ['More formal version of the text', 'Alternative formal writing']
      }),
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);
    const result = await rewriteText('Original text here', 'Tone Tuner', 'formal');

    expect(result.result).toEqual(['More formal version of the text', 'Alternative formal writing']);
    expect(result.usage).toEqual(mockUsageMetadata);
    expect(mockAi.models.generateContent).toHaveBeenCalledTimes(1);

    const callArgs = mockAi.models.generateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-3-pro-preview');
    expect(callArgs.contents).toContain('Original Text: "Original text here"');
    expect(callArgs.contents).toContain('Edit Mode: Tone Tuner');
    expect(callArgs.contents).toContain('Target Tone: formal');
    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.config.responseSchema).toEqual(
      expect.objectContaining({
        type: 'OBJECT',
        properties: expect.objectContaining({
          variations: expect.objectContaining({
            type: 'ARRAY',
          }),
        }),
        required: ['variations'],
      }),
    );
  });

  it('rewrites text with setting context', async () => {
    const mockResponse = {
      text: JSON.stringify({
        variations: ['Historically accurate text']
      }),
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);
    const setting = { timePeriod: 'Medieval', location: 'England' };
    const result = await rewriteText('Modern text', 'Edit Mode', undefined, setting);

    expect(result.result).toEqual(['Historically accurate text']);
    expect(mockAi.models.generateContent).toHaveBeenCalledTimes(1);

    const callArgs = mockAi.models.generateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('Edit Mode: Edit Mode');
    expect(typeof callArgs.config.systemInstruction).toBe('string');
    expect(callArgs.config.systemInstruction).toEqual(expect.stringContaining('Medieval'));
    expect(callArgs.config.systemInstruction).toEqual(expect.stringContaining('England'));
    expect(callArgs.config.systemInstruction).not.toContain('{{SETTING_INSTRUCTION}}');
    expect(callArgs.config.responseMimeType).toBe('application/json');
  });

  it('handles JSON wrapped in markdown fences and preambles via resilient parser', async () => {
    const mockResponse = {
      text: 'Here is the JSON: ```json\n{"variations":["Cleaned 1","Cleaned 2"]}\n```\nThanks!',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual(['Cleaned 1', 'Cleaned 2']);
    expect(result.usage).toEqual(mockUsageMetadata);
  });

  it('falls back to empty variations when response does not match expected schema', async () => {
    const mockResponse = {
      text: JSON.stringify({ notVariations: ['A', 'B'] }),
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual([]);
    expect(result.usage).toEqual(mockUsageMetadata);
  });

  it('handles malformed JSON response gracefully', async () => {
    const mockResponse = chaosResponses.malformedJson;

    mockAi.models.generateContent.mockResolvedValue(mockResponse as any);

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual([]);
    expect(result.usage).toEqual(mockUsageMetadata);
  });

  it('handles empty string response gracefully', async () => {
    const mockResponse = chaosResponses.emptyText;

    mockAi.models.generateContent.mockResolvedValue(mockResponse as any);

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual([]);
    expect(result.usage).toEqual(mockUsageMetadata);
  });

  it('handles API errors gracefully', async () => {
    mockAi.models.generateContent.mockRejectedValue(new Error('API Error'));

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual([]);
    expect(result.usage).toBeUndefined();
  });

  it('handles rate limit errors gracefully', async () => {
    mockAi.models.generateContent.mockRejectedValue(createRateLimitError());

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual([]);
    expect(result.usage).toBeUndefined();
  });

  it('handles context length exceeded errors gracefully', async () => {
    mockAi.models.generateContent.mockRejectedValue(createContextLengthError());

    const result = await rewriteText('Some text', 'Edit Mode');

    expect(result.result).toEqual([]);
    expect(result.usage).toBeUndefined();
  });

  it('supports abort signal', async () => {
    const mockResponse = {
      text: JSON.stringify({ variations: ['Result'] }),
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const abortController = new AbortController();
    const result = await rewriteText('Text', 'Edit Mode', undefined, undefined, abortController.signal);

    expect(result.result).toEqual(['Result']);
    expect(mockAi.models.generateContent).toHaveBeenCalled();
  });
});

describe('generateContinuation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns continuation from the model output', async () => {
    const mockResponse = {
      text: 'The lantern guttered as the storm closed in.',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await generateContinuation('She stepped outside and lifted her face to the rain.');

    expect(result.result).toBe('The lantern guttered as the storm closed in.');
    expect(result.usage).toEqual(mockUsageMetadata);
    expect(mockAi.models.generateContent).toHaveBeenCalledWith({
      model: expect.any(String),
      contents: expect.stringContaining('She stepped outside and lifted her face to the rain.'),
      config: { systemInstruction: expect.any(String) }
    });
  });

  it('throws an AIError when no continuation text is returned', async () => {
    const mockResponse = {
      text: '',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    await expect(generateContinuation('Context without response')).rejects.toBeInstanceOf(AIError);
  });
});

describe('getContextualHelp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets explain help for text', async () => {
    const mockResponse = {
      text: 'This means the character is conflicted',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await getContextualHelp('ambiguous text', 'Explain');

    expect(result.result).toBe('This means the character is conflicted');
    expect(result.usage).toEqual(mockUsageMetadata);
    expect(mockAi.models.generateContent).toHaveBeenCalledWith({
      model: expect.any(String),
      contents: 'Type: Explain\nText: "ambiguous text"\nKeep the answer short and helpful.',
      config: { systemInstruction: expect.any(String) }
    });
  });

  it('gets thesaurus help for text', async () => {
    const mockResponse = {
      text: 'Synonyms: happy, joyful, cheerful',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await getContextualHelp('happy', 'Thesaurus');

    expect(result.result).toBe('Synonyms: happy, joyful, cheerful');
    expect(mockAi.models.generateContent).toHaveBeenCalledWith({
      model: expect.any(String),
      contents: 'Type: Thesaurus\nText: "happy"\nKeep the answer short and helpful.',
      config: { systemInstruction: expect.any(String) }
    });
  });

  it('handles empty response gracefully', async () => {
    const mockResponse = {
      text: '',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await getContextualHelp('text', 'Explain');

    expect(result.result).toBe('No result found.');
  });

  it('supports abort signal', async () => {
    const mockResponse = {
      text: 'Help text',
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const abortController = new AbortController();
    await getContextualHelp('text', 'Explain', abortController.signal);

    expect(mockAi.models.generateContent).toHaveBeenCalled();
  });
});

describe('createAgentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates session with lore context', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const session = createAgentSession(mockLore);

    expect(mockAi.chats.create).toHaveBeenCalledWith({
      model: expect.any(String),
      config: {
        systemInstruction: expect.any(String),
        tools: [{ functionDeclarations: ALL_AGENT_TOOLS }]
      }
    });

    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('John Doe');
    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('Main protagonist');
    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('Magic exists but is rare');
    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('Technology is medieval level');
  });

  it('creates session with analysis context', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const session = createAgentSession(undefined, mockAnalysisResult);

    expect(mockAi.chats.create).toHaveBeenCalledWith({
      model: expect.any(String),
      config: {
        systemInstruction: expect.any(String),
        tools: [{ functionDeclarations: ALL_AGENT_TOOLS }]
      }
    });

    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('Test analysis summary');
    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('Strong character development');
    expect(mockAi.chats.create.mock.calls[0][0].config.systemInstruction).toContain('Plot hole in chapter 3');
  });

  it('creates session with full manuscript context', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const manuscriptText = 'Full manuscript content here...';
    const session = createAgentSession(undefined, undefined, manuscriptText);

    expect(mockAi.chats.create).toHaveBeenCalledWith({
      model: expect.any(String),
      config: {
        systemInstruction: expect.stringContaining(manuscriptText),
        tools: [{ functionDeclarations: ALL_AGENT_TOOLS }]
      }
    });
  });

  it('creates session with persona instructions', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const persona = createMockPersona('architect', 'The Architect', 'direct');
    const session = createAgentSession(undefined, undefined, undefined, persona);

    expect(mockAi.chats.create).toHaveBeenCalledWith({
      model: expect.any(String),
      config: {
        systemInstruction: expect.stringContaining('The Architect'),
        tools: [{ functionDeclarations: ALL_AGENT_TOOLS }]
      }
    });
  });

  it('creates session with combined context (lore + analysis + manuscript + persona)', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const persona = createMockPersona('poet', 'The Poet', 'creative');
    const manuscriptText = 'Chapter 1 content...';
    const session = createAgentSession(mockLore, mockAnalysisResult, manuscriptText, persona);

    const systemInstruction = mockAi.chats.create.mock.calls[0][0].config.systemInstruction;
    
    expect(systemInstruction).toContain(manuscriptText);
    expect(systemInstruction).toContain('The Poet');
    expect(systemInstruction).toContain('John Doe');
    expect(systemInstruction).toContain('Test analysis summary');
  });

  it('handles empty lore gracefully', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const emptyLore = { characters: [], worldRules: [] };
    const session = createAgentSession(emptyLore);

    expect(mockAi.chats.create).toHaveBeenCalled();
    const systemInstruction = mockAi.chats.create.mock.calls[0][0].config.systemInstruction;
    expect(systemInstruction).toContain('CHARACTERS:');
    expect(systemInstruction).toContain('WORLD RULES / SETTING DETAILS:');
  });

  it('creates session without any context', () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat);

    const session = createAgentSession();

    expect(mockAi.chats.create).toHaveBeenCalledWith({
      model: expect.any(String),
      config: {
        systemInstruction: expect.any(String),
        tools: [{ functionDeclarations: ALL_AGENT_TOOLS }]
      }
    });

    const systemInstruction = mockAi.chats.create.mock.calls[0][0].config.systemInstruction;
    expect(typeof systemInstruction).toBe('string');
    expect(systemInstruction).toContain('[FULL MANUSCRIPT CONTEXT]');
  });

  it('propagates chat sendMessage network errors to the caller', async () => {
    const error = new Error('Network error');
    const mockChat = { sendMessage: vi.fn().mockRejectedValue(error) };
    mockAi.chats.create.mockReturnValue(mockChat as any);

    const session = createAgentSession(mockLore);

    await expect(session.sendMessage({ message: 'Hello agent' })).rejects.toThrow('Network error');
    expect(mockChat.sendMessage).toHaveBeenCalledWith({ message: 'Hello agent' });
  });
});

describe('QuillAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes a chat session with provided options', async () => {
    const mockChat = { sendMessage: vi.fn() };
    mockAi.chats.create.mockReturnValue(mockChat as any);

    const agent = new QuillAgent({ fullManuscriptContext: 'Hello world' });

    await agent.initialize();

    expect(mockAi.chats.create).toHaveBeenCalledWith({
      model: expect.any(String),
      config: expect.objectContaining({
        systemInstruction: expect.any(String),
        tools: [{ functionDeclarations: ALL_AGENT_TOOLS }],
      }),
    });
  });

  it('normalizes rate limit errors during initialize', async () => {
    mockAi.chats.create.mockImplementation(() => {
      throw createRateLimitError();
    });

    const agent = new QuillAgent({ telemetryContext: { phase: 'test' } });

    await expect(agent.initialize()).rejects.toBeInstanceOf(RateLimitError);
    try {
      await agent.initialize();
    } catch (err) {
      const e = err as RateLimitError;
      expect(e.isRetryable).toBe(true);
    }
  });

  it('normalizes context length exceeded errors during initialize', async () => {
    mockAi.chats.create.mockImplementation(() => {
      throw createContextLengthError();
    });

    const agent = new QuillAgent({});

    await expect(agent.initialize()).rejects.toBeInstanceOf(UnknownAIError);
    try {
      await agent.initialize();
    } catch (err) {
      const e = err as UnknownAIError;
      expect(e.isRetryable).toBe(false);
      expect(e.message).toContain('Context length exceeded');
    }
  });

  it('throws AIError if sendMessage is called before initialize', async () => {
    const agent = new QuillAgent({});
    await expect(agent.sendMessage({ message: 'Hi' } as any)).rejects.toBeInstanceOf(AIError);
  });

  it('normalizes errors thrown by chat.sendMessage', async () => {
    const error = createRateLimitError();
    const mockChat = { sendMessage: vi.fn().mockRejectedValue(error) };
    mockAi.chats.create.mockReturnValue(mockChat as any);

    const agent = new QuillAgent({});
    await agent.initialize();

    await expect(agent.sendMessage({ message: 'Hello agent' } as any)).rejects.toBeInstanceOf(RateLimitError);
    expect(mockChat.sendMessage).toHaveBeenCalledWith({ message: 'Hello agent' });
  });
});
