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
import { useAppBrain } from '@/features/shared';
import { ChatMessage } from '@/types';
import { Persona, DEFAULT_PERSONAS } from '@/types/personas';
import { useSettingsStore } from '@/features/settings';
import { emitToolExecuted } from '@/services/appBrain';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AgentMode = 'text' | 'voice';

// Internal agent state for reducer (discriminated union)
type BaseAgentState =
  | { status: 'idle'; error?: never }
  | { status: 'thinking'; currentRequest: string }
  | { status: 'executing'; tool: string }
  | { status: 'error'; error: string };

type AgentState = BaseAgentState & {
  isReady: boolean;
  lastToolCall?: { name: string; success: boolean };
};

type AgentAction =
  | { type: 'SESSION_READY' }
  | { type: 'START_THINKING'; request: string }
  | { type: 'START_EXECUTION'; tool: string }
  | { type: 'TOOL_COMPLETE'; tool: string; success: boolean; error?: string }
  | { type: 'FINISH' }
  | { type: 'ERROR'; error: string }
  | { type: 'ABORT' };

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
    (state: AgentState, action: AgentAction) => AgentState
  >(
    (state, action) => {
      switch (action.type) {
        case 'SESSION_READY':
          return { ...state, isReady: true };
        case 'START_THINKING':
          return {
            status: 'thinking',
            currentRequest: action.request,
            isReady: state.isReady,
            lastToolCall: state.lastToolCall,
          };
        case 'START_EXECUTION':
          return {
            status: 'executing',
            tool: action.tool,
            isReady: state.isReady,
            lastToolCall: { name: action.tool, success: false },
          };
        case 'TOOL_COMPLETE':
          if (action.success) {
            // After a successful tool call, return to thinking for follow-up model response
            const previousRequest =
              state.status === 'thinking' ? state.currentRequest : '';
            return {
              status: 'thinking',
              currentRequest: previousRequest,
              isReady: state.isReady,
              lastToolCall: { name: action.tool, success: true },
            };
          }
          return {
            status: 'error',
            error: action.error ?? 'Unknown error',
            isReady: state.isReady,
            lastToolCall: { name: action.tool, success: false },
          };
        case 'FINISH':
          return {
            status: 'idle',
            isReady: state.isReady,
            lastToolCall: state.lastToolCall,
          };
        case 'ERROR':
          return {
            status: 'error',
            error: action.error,
            isReady: state.isReady,
            lastToolCall: state.lastToolCall,
          };
        case 'ABORT':
          return {
            status: 'idle',
            isReady: state.isReady,
            lastToolCall: state.lastToolCall,
          };
        default:
          return state;
      }
    },
    {
      status: 'idle',
      isReady: false,
    }
  );
  const [currentPersona, setCurrentPersona] = useState<Persona>(
    initialPersona || DEFAULT_PERSONAS[0]
  );
  const isReady = agentState.isReady;
  const isProcessing =
    agentState.status === 'thinking' || agentState.status === 'executing';
  
  // Refs
  const chatRef = useRef<Chat | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Settings
  const critiqueIntensity = useSettingsStore(s => s.critiqueIntensity);
  const experienceLevel = useSettingsStore(s => s.experienceLevel);
  const autonomyMode = useSettingsStore(s => s.autonomyMode);

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  const initSession = useCallback(() => {
    const { manuscript, lore, analysis, intelligence } = brain.state;
    
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
    });

    // Silent initialization
    chatRef.current?.sendMessage({
      message: `Session initialized. Project: "${manuscript.projectTitle}". Chapters: ${manuscript.chapters.length}. Active: "${manuscript.chapters.find(c => c.id === manuscript.activeChapterId)?.title}". I am ${currentPersona.name}, ready to assist.`
    }).then(() => {
      dispatch({ type: 'SESSION_READY' });
    }).catch(console.error);
  }, [brain.state, currentPersona, critiqueIntensity, experienceLevel, autonomyMode]);

  // Initialize on mount
  useEffect(() => {
    initSession();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [initSession]);

  // Reinit when persona changes
  useEffect(() => {
    if (chatRef.current && isReady) {
      initSession();
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
      const { ui } = brain.state;
      const contextPrompt = `
[CURRENT CONTEXT]
${brain.context.getCompressedContext()}

[USER STATE]
Cursor: ${ui.cursor.position}
Selection: ${ui.selection ? `"${ui.selection.text.slice(0, 100)}${ui.selection.text.length > 100 ? '...' : ''}"` : 'None'}

[USER REQUEST]
${messageText}
`;

      // Send to agent
      let result = await chatRef.current.sendMessage({ message: contextPrompt });

      // Tool execution loop
      while (result.functionCalls && result.functionCalls.length > 0) {
        if (signal.aborted) return;

        const functionResponses = [];
        for (const call of result.functionCalls) {
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

        if (signal.aborted) return;
        
        dispatch({ type: 'START_THINKING', request: messageText });
        result = await chatRef.current.sendMessage({
          message: functionResponses.map(resp => ({ functionResponse: resp }))
        });
      }

      // Final response
      setMessages(prev => [...prev, {
        role: 'model',
        text: result.text || 'Done.',
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
  }, [brain.state, brain.context, executeToolCall]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL METHODS
  // ─────────────────────────────────────────────────────────────────────────

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    dispatch({ type: 'ABORT' });
  }, []);

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
      lastError: agentState.status === 'error' ? agentState.error : undefined,
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
