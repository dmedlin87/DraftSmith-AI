/**
 * Agent Service Hook
 * 
 * Decouples the tool execution loop from UI components.
 * Can be invoked from Chat, Voice, or Magic Editor contexts.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChatMessage, EditorContext, AnalysisResult, CharacterProfile } from '@/types';
import { Lore, Chapter } from '@/types/schema';
import { Persona, DEFAULT_PERSONAS } from '@/types/personas';
import { useSettingsStore } from '@/features/settings';
import { ManuscriptHUD } from '@/types/intelligence';
import { getMemoriesForContext, getActiveGoals, formatMemoriesForPrompt, formatGoalsForPrompt } from '@/services/memory';
import {
  DefaultAgentController,
  AgentController,
  AgentContextInput,
  AgentControllerDependencies,
  AgentControllerEvents,
  AgentToolExecutor,
  MemoryProvider,
} from '@/services/core/AgentController';

// Tool action handler type
export type ToolActionHandler = (toolName: string, args: Record<string, unknown>) => Promise<string>;

export interface AgentState {
  status: 'idle' | 'thinking' | 'executing' | 'error';
  lastError?: string;
}

export interface UseAgentServiceOptions {
  lore?: Lore;
  chapters?: Chapter[];
  analysis?: AnalysisResult | null;
  onToolAction: ToolActionHandler;
  initialPersona?: Persona;
  intelligenceHUD?: ManuscriptHUD;
  interviewTarget?: CharacterProfile;
  /** Project ID for memory context - enables persistent memory */
  projectId?: string | null;
  /**
   * Limit the number of stored chat messages to avoid unbounded growth.
   * Defaults to 200 if not provided.
   */
  messageLimit?: number;
}

export interface AgentServiceResult {
  // State
  messages: ChatMessage[];
  agentState: AgentState;
  isProcessing: boolean;
  currentPersona: Persona;
  
  // Actions
  sendMessage: (message: string, editorContext: EditorContext) => Promise<void>;
  resetSession: () => void;
  clearMessages: () => void;
  setPersona: (persona: Persona) => void;
}

/**
 * Creates and manages an agent chat session with tool execution capabilities.
 * Extracts the tool loop logic from ChatInterface for reuse across different UI surfaces.
 */
export function useAgentService(
  fullText: string,
  options: UseAgentServiceOptions
): AgentServiceResult {
  const { lore, chapters = [], analysis, onToolAction, initialPersona, intelligenceHUD, interviewTarget, projectId } = options;

  const messageLimit = Number.isFinite(options.messageLimit) && (options.messageLimit as number) > 0
    ? Math.floor(options.messageLimit as number)
    : 200;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>({ status: 'idle' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPersona, setCurrentPersona] = useState<Persona>(initialPersona || DEFAULT_PERSONAS[0]);
  
  const controllerRef = useRef<AgentController | null>(null);
  const isInitialMount = useRef(true);
  
  // Subscribe to settings changes
  const critiqueIntensity = useSettingsStore(state => state.critiqueIntensity);
  const experienceLevel = useSettingsStore(state => state.experienceLevel);
  const autonomyMode = useSettingsStore(state => state.autonomyMode);

  const appendMessages = useCallback((newMessages: ChatMessage | ChatMessage[]) => {
    const additions = Array.isArray(newMessages) ? newMessages : [newMessages];
    setMessages(prev => {
      const next = [...prev, ...additions];
      return next.length > messageLimit ? next.slice(-messageLimit) : next;
    });
  }, [messageLimit]);

  /**
   * Build memory context string from stored memories and goals
   */
  const buildMemoryContext = useCallback(async (): Promise<string> => {
    if (!projectId) return '';
    
    try {
      const [memories, goals] = await Promise.all([
        getMemoriesForContext(projectId, { limit: 25 }),
        getActiveGoals(projectId),
      ]);

      let memorySection = '[AGENT MEMORY]\n';
      
      const formattedMemories = formatMemoriesForPrompt(memories, { maxLength: 3000 });
      if (formattedMemories) {
        memorySection += formattedMemories + '\n';
      } else {
        memorySection += '(No stored memories yet.)\n';
      }

      const formattedGoals = formatGoalsForPrompt(goals);
      if (formattedGoals) {
        memorySection += '\n' + formattedGoals + '\n';
      }

      return memorySection;
    } catch (error) {
      console.warn('[AgentService] Failed to fetch memory context:', error);
      return '';
    }
  }, [projectId]);

  const createToolExecutor = useCallback((): AgentToolExecutor => ({
    async execute(toolName, args) {
      try {
        const message = await onToolAction(toolName, args);
        return { success: true, message };
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        return {
          success: false,
          message: `Error executing ${toolName}: ${errorMessage}`,
          error: errorMessage,
        };
      }
    },
  }), [onToolAction]);

  const createMemoryProvider = useCallback((): MemoryProvider | undefined => {
    if (!projectId) return undefined;
    return {
      async buildMemoryContext(_projectId: string): Promise<string> {
        return buildMemoryContext();
      },
    };
  }, [projectId, buildMemoryContext]);

  /**
   * Initialize or reinitialize the chat session
   */
  const initSession = useCallback(async () => {
    if (!controllerRef.current) return;
    await controllerRef.current.initializeChat(currentPersona, projectId ?? null);
  }, [currentPersona, projectId]);

  // Initialize session on mount and when dependencies change
  useEffect(() => {
    const context: AgentContextInput = {
      fullText,
      chapters,
      lore,
      analysis: analysis || null,
      intelligenceHUD,
      interviewTarget,
      projectId: projectId ?? null,
      critiqueIntensity,
      experienceLevel,
      autonomyMode,
    };

    const deps: AgentControllerDependencies = {
      toolExecutor: createToolExecutor(),
      memoryProvider: createMemoryProvider(),
    };

    const events: AgentControllerEvents = {
      onStateChange: (state) => {
        setAgentState(state);
        setIsProcessing(state.status === 'thinking' || state.status === 'executing');
      },
      onMessage: (message) => {
        appendMessages(message);
      },
      onToolCallStart: ({ name }) => {
        setAgentState({ status: 'executing' });
        appendMessages({
          role: 'model',
          text: `🛠️ Suggesting Action: ${name}...`,
          timestamp: new Date()
        });
      },
      onToolCallEnd: ({ result }) => {
        if (result.message.includes('Waiting for user review')) {
          appendMessages({
            role: 'model',
            text: `📝 Reviewing proposed edit...`,
            timestamp: new Date()
          });
        }
      },
      onError: (error) => {
        console.error('[AgentService] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setAgentState({
          status: 'error',
          lastError: errorMessage
        });
        appendMessages({
          role: 'model',
          text: "Sorry, I encountered an error connecting to the Agent.",
          timestamp: new Date()
        });
      },
    };

    const controller = new DefaultAgentController({
      context,
      deps,
      events,
      initialPersona: currentPersona,
    });

    controllerRef.current = controller;

    initSession().catch(console.error);

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [
    fullText,
    chapters,
    lore,
    analysis,
    intelligenceHUD,
    interviewTarget,
    projectId,
    critiqueIntensity,
    experienceLevel,
    autonomyMode,
    appendMessages,
    createToolExecutor,
    createMemoryProvider,
    currentPersona,
    initSession,
  ]);

  /**
   * Send a message to the agent and process the response
   */
  const sendMessage = useCallback(async (
    messageText: string,
    editorContext: EditorContext
  ) => {
    if (!messageText.trim()) return;
    if (!controllerRef.current) return;

    await controllerRef.current.sendMessage({
      text: messageText,
      editorContext,
    });
  }, []);

  /**
   * Reset the chat session (keeps messages)
   */
  const resetSession = useCallback(async () => {
    controllerRef.current?.abortCurrentRequest();
    await initSession();
    setAgentState({ status: 'idle' });
  }, [initSession]);

  /**
   * Clear all messages and reset session
   */
  const clearMessages = useCallback(async () => {
    setMessages([]);
    await resetSession();
  }, [resetSession]);

  /**
   * Switch to a different persona and reinitialize the session
   */
  const setPersona = useCallback((persona: Persona) => {
    setCurrentPersona(persona);
    // Session will reinitialize via useEffect dependency
  }, []);

  // Reinitialize when persona changes (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (controllerRef.current) {
      initSession().then(() => {
        appendMessages({
          role: 'model',
          text: `${currentPersona.icon} Switching to ${currentPersona.name} mode. ${currentPersona.role}.`,
          timestamp: new Date()
        });
      }).catch(console.error);
    }
  }, [appendMessages, currentPersona]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abortCurrentRequest();
    };
  }, []);

  return {
    messages,
    agentState,
    isProcessing,
    currentPersona,
    sendMessage,
    resetSession,
    clearMessages,
    setPersona,
  };
}
