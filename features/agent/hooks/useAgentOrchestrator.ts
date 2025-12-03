/**
 * Agent Orchestrator Hook
 * 
 * Unified agent interface that uses AppBrain for complete app awareness.
 * Handles both text and voice modes with the same underlying architecture.
 * 
 * This is the NEW way to interact with the agent - replaces manual context passing.
 */

import { useState, useRef, useCallback, useEffect, useReducer } from 'react';
import { Chat } from '@google/genai';
import { createAgentSession } from '@/services/gemini/agent';
import { ALL_AGENT_TOOLS, VOICE_SAFE_TOOLS } from '@/services/gemini/agentTools';
import { executeAgentToolCall } from '@/services/gemini/toolExecutor';
import { useAppBrain } from '@/features/core';
import { ChatMessage } from '@/types';
import { Persona, DEFAULT_PERSONAS } from '@/types/personas';
import { useSettingsStore } from '@/features/settings';
import { emitToolExecuted, eventBus } from '@/services/appBrain';
import type { AppEvent } from '@/services/appBrain';
import { runAgentToolLoop, AgentToolLoopModelResult } from '@/services/core/agentToolLoop';
import {
  agentOrchestratorReducer,
  initialAgentMachineState,
  AgentMachineAction,
  AgentMachineState,
} from '@/services/core/agentOrchestratorMachine';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AgentMode = 'text' | 'voice';

// Internal agent state is now modeled by AgentMachineState/AgentMachineAction in services/core

export interface AgentOrchestratorState {
  status: 'idle' | 'thinking' | 'executing' | 'speaking' | 'error';
  lastError?: string;
  lastToolCall?: { name: string; success: boolean };
}

export interface UseAgentOrchestratorOptions {
  mode?: AgentMode;
  persona?: Persona;
  /** Auto-reinitialize when context changes significantly */
  autoReinit?: boolean;
}

export interface AgentOrchestratorResult {
  // State
  isReady: boolean;
  isProcessing: boolean;
  state: AgentOrchestratorState;
  messages: ChatMessage[];
  currentPersona: Persona;
  
  // Text Mode
  sendMessage: (message: string) => Promise<void>;
  
  // Voice Mode (placeholder for now)
  isVoiceMode: boolean;
  
  // Control
  abort: () => void;
  reset: () => void;
  clearMessages: () => void;
  setPersona: (persona: Persona) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useAgentOrchestrator(
  options: UseAgentOrchestratorOptions = {}
): AgentOrchestratorResult {
  const { mode = 'text', persona: initialPersona, autoReinit = true } = options;
  
  // Get unified app state
  const brain = useAppBrain();
  
  // Local state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentState, dispatch] = useReducer<
    (state: AgentMachineState, action: AgentMachineAction) => AgentMachineState
  >(agentOrchestratorReducer, initialAgentMachineState);
  const [currentPersona, setCurrentPersona] = useState<Persona>(
    initialPersona || DEFAULT_PERSONAS[0]
  );
  const isReady = agentState.isReady;
  const isProcessing =
    agentState.status === 'thinking' || agentState.status === 'executing';

  // Refs
  const chatRef = useRef<Chat | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestStateRef = useRef(brain.state);
  const orchestratorEventLogRef = useRef<AppEvent[]>(eventBus.getChangeLog(10));
  const hasSeenContextChangeRef = useRef(false);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    dispatch({ type: 'ABORT' });
  }, []);
  
  // Settings
  const critiqueIntensity = useSettingsStore(s => s.critiqueIntensity);
  const experienceLevel = useSettingsStore(s => s.experienceLevel);
  const autonomyMode = useSettingsStore(s => s.autonomyMode);
  const manuscriptProjectId = brain.state.manuscript.projectId;

  // Keep a ref to the latest brain state so callbacks can read fresh context without re-registering
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    latestStateRef.current = brain.state;
  });

  useEffect(() => {
    const unsubscribe = eventBus.subscribeForOrchestrator((event) => {
      orchestratorEventLogRef.current = [
        ...orchestratorEventLogRef.current.slice(-9),
        event,
      ];
    }, {
      types: ['TEXT_CHANGED', 'ANALYSIS_COMPLETED', 'PANEL_SWITCHED', 'TOOL_EXECUTED'],
      replay: true,
    });

    return unsubscribe;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  const initSession = useCallback(async () => {
    const { manuscript, lore, analysis, intelligence } = latestStateRef.current;
    
    // Build full manuscript context
    const fullManuscript = manuscript.chapters.map(c => {
      const isActive = c.id === manuscript.activeChapterId;
      return `[CHAPTER: ${c.title}]${isActive ? " (ACTIVE - You can edit this)" : " (READ ONLY)"}\n${c.content}\n`;
    }).join('\n-------------------\n');

    // Create session with full context
    chatRef.current = createAgentSession({
      lore: lore.characters.length > 0 ? { characters: lore.characters, worldRules: lore.worldRules } : undefined,
      analysis: analysis.result || undefined,
      fullManuscriptContext: fullManuscript,
      persona: currentPersona,
      intensity: critiqueIntensity,
      experience: experienceLevel,
      autonomy: autonomyMode,
      intelligenceHUD: intelligence.hud || undefined,
      mode,
    });

    // Silent initialization – tolerate providers or mocks that don't return a Promise
    try {
      const session = chatRef.current;
      if (session && typeof session.sendMessage === 'function') {
        await session.sendMessage({
          message: `Session initialized. Project: "${manuscript.projectTitle}". Chapters: ${manuscript.chapters.length}. Active: "${manuscript.chapters.find(c => c.id === manuscript.activeChapterId)?.title}". I am ${currentPersona.name}, ready to assist.`,
        } as any);
      }
    } catch (error) {
      console.error(error);
    }

    dispatch({ type: 'SESSION_READY' });
  }, [currentPersona, critiqueIntensity, experienceLevel, autonomyMode, mode]);

  // Initialize on mount
  useEffect(() => {
    initSession();
    return () => {
      abortControllerRef.current?.abort();
    };
    // We deliberately initialize only once. Context-based reinitialization is
    // handled by a dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoReinit) return;

    if (!hasSeenContextChangeRef.current) {
      hasSeenContextChangeRef.current = true;
      return;
    }

    abort();
    chatRef.current = null;
    initSession();
  }, [
    autoReinit,
    manuscriptProjectId,
    currentPersona,
    brain.state.lore,
    brain.state.analysis.result,
    initSession,
    abort,
  ]);

  // Persona change announcement (session reinit is handled by the initSession effect)
  useEffect(() => {
    if (chatRef.current && isReady) {
      setMessages(prev => [...prev, {
        role: 'model',
        text: `${currentPersona.icon} Switched to ${currentPersona.name}. ${currentPersona.role}.`,
        timestamp: new Date()
      }]);
    }
  }, [currentPersona]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL EXECUTION
  // ─────────────────────────────────────────────────────────────────────────

  const executeToolCall = useCallback(async (
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    dispatch({ type: 'START_EXECUTION', tool: toolName });

    const projectId = brain.state.manuscript.projectId;
    const result = await executeAgentToolCall(toolName, args, brain.actions, projectId);

    if (result.success) {
      emitToolExecuted(toolName, true);
      dispatch({ type: 'TOOL_COMPLETE', tool: toolName, success: true });
    } else {
      emitToolExecuted(toolName, false);
      dispatch({
        type: 'TOOL_COMPLETE',
        tool: toolName,
        success: false,
        error: result.error ?? 'Unknown error',
      });
    }
    return result.message;
  }, [brain.actions, brain.state.manuscript.projectId]);

  // ─────────────────────────────────────────────────────────────────────────
  // MESSAGE HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !chatRef.current) return;

    // Cancel pending requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Add user message
    const userMsg: ChatMessage = {
      role: 'user',
      text: messageText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    dispatch({ type: 'START_THINKING', request: messageText });

    try {
      // Build context-aware prompt using AppBrain
      const { ui } = latestStateRef.current;
      const mic = ui.microphone;
      const recentEvents = orchestratorEventLogRef.current.length > 0
        ? orchestratorEventLogRef.current
            .slice(-5)
            .map(ev => `${new Date(ev.timestamp).toLocaleTimeString()}: ${ev.type}`)
            .join('\n')
        : 'None';

      const contextPrompt = `
[CURRENT CONTEXT]
${brain.context.getCompressedContext()}

[INPUT MODE]
Agent mode: ${mode}. Microphone: ${mic.status}${mic.lastTranscript ? ` (last transcript: "${mic.lastTranscript}")` : ''}.

[USER STATE]
Cursor: ${ui.cursor.position}
Selection: ${ui.selection ? `"${ui.selection.text.slice(0, 100)}${ui.selection.text.length > 100 ? '...' : ''}"` : 'None'}

[RECENT EVENTS]
${recentEvents}

[USER REQUEST]
${messageText}
`;

      const chat = chatRef.current;
      if (!chat) return;

      // Send to agent and run shared tool loop
      const initialResult = (await chat.sendMessage({
        message: contextPrompt,
      })) as AgentToolLoopModelResult;

      const finalResult = await runAgentToolLoop<AgentToolLoopModelResult>({
        chat,
        initialResult,
        abortSignal: signal,
        processToolCalls: async functionCalls => {
          const functionResponses: { id: string; name: string; response: { result: string } }[] = [];
          for (const call of functionCalls) {
            // Show tool call in UI
            setMessages(prev => [...prev, {
              role: 'model',
              text: `🛠️ ${call.name}...`,
              timestamp: new Date()
            }]);

            const actionResult = await executeToolCall(
              call.name,
              call.args as Record<string, unknown>
            );

            functionResponses.push({
              id: call.id || crypto.randomUUID(),
              name: call.name,
              response: { result: actionResult }
            });
          }
          return functionResponses;
        },
        onThinkingRoundStart: () => {
          dispatch({ type: 'START_THINKING', request: messageText });
        },
      });

      if (signal.aborted) return;

      // Final response
      setMessages(prev => [...prev, {
        role: 'model',
        text: finalResult.text || 'Done.',
        timestamp: new Date()
      }]);
      dispatch({ type: 'FINISH' });

    } catch (e) {
      if (signal.aborted) return;
      
      console.error('[AgentOrchestrator] Error:', e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      dispatch({ type: 'ERROR', error: errorMessage });
      
      setMessages(prev => [...prev, {
        role: 'model',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      // isProcessing is derived from reducer state; no manual reset here
    }
  }, [brain.context, executeToolCall, mode]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL METHODS
  // ─────────────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abort();
    initSession();
  }, [abort, initSession]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    reset();
  }, [reset]);

  const setPersona = useCallback((persona: Persona) => {
    setCurrentPersona(persona);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────────────────────────

  return {
    isReady,
    isProcessing,
    state: {
      status: agentState.status,
      lastError: agentState.status === 'error' ? agentState.lastError : undefined,
      lastToolCall: agentState.lastToolCall,
    },
    messages,
    currentPersona,
    sendMessage,
    isVoiceMode: mode === 'voice',
    abort,
    reset,
    clearMessages,
    setPersona,
  };
}
