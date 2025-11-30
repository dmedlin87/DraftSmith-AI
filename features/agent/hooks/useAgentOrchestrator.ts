/**
 * Agent Orchestrator Hook
 * 
 * Unified agent interface that uses AppBrain for complete app awareness.
 * Handles both text and voice modes with the same underlying architecture.
 * 
 * This is the NEW way to interact with the agent - replaces manual context passing.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Chat } from '@google/genai';
import { createAgentSession } from '@/services/gemini/agent';
import { ALL_AGENT_TOOLS, VOICE_SAFE_TOOLS } from '@/services/gemini/agentTools';
import { useAppBrain } from '@/features/shared';
import { ChatMessage } from '@/types';
import { Persona, DEFAULT_PERSONAS } from '@/types/personas';
import { useSettingsStore } from '@/features/settings';
import { emitToolExecuted } from '@/services/appBrain';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AgentMode = 'text' | 'voice';

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
  const [state, setState] = useState<AgentOrchestratorState>({ status: 'idle' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPersona, setCurrentPersona] = useState<Persona>(
    initialPersona || DEFAULT_PERSONAS[0]
  );
  const [isReady, setIsReady] = useState(false);
  
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
    chatRef.current = createAgentSession(
      lore.characters.length > 0 ? { characters: lore.characters, worldRules: lore.worldRules } : undefined,
      analysis.result || undefined,
      fullManuscript,
      currentPersona,
      critiqueIntensity,
      experienceLevel,
      autonomyMode,
      intelligence.hud || undefined
    );

    // Silent initialization
    chatRef.current?.sendMessage({
      message: `Session initialized. Project: "${manuscript.projectTitle}". Chapters: ${manuscript.chapters.length}. Active: "${manuscript.chapters.find(c => c.id === manuscript.activeChapterId)?.title}". I am ${currentPersona.name}, ready to assist.`
    }).then(() => {
      setIsReady(true);
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
    setState(s => ({ ...s, status: 'executing', lastToolCall: { name: toolName, success: false } }));
    
    try {
      let result: string;
      
      // Route to appropriate action
      switch (toolName) {
        // Navigation
        case 'navigate_to_text':
          result = await brain.actions.navigateToText({
            query: args.query as string,
            searchType: args.searchType as any,
            character: args.character as string,
            chapter: args.chapter as string,
          });
          break;
        case 'jump_to_chapter':
          result = await brain.actions.jumpToChapter(args.identifier as string);
          break;
        case 'jump_to_scene':
          result = await brain.actions.jumpToScene(
            args.sceneType as string,
            args.direction as 'next' | 'previous'
          );
          break;
        case 'scroll_to_position':
          brain.actions.scrollToPosition(args.position as number);
          result = `Scrolled to position ${args.position}`;
          break;
          
        // Editing
        case 'update_manuscript':
          result = await brain.actions.updateManuscript({
            searchText: args.search_text as string,
            replacementText: args.replacement_text as string,
            description: args.description as string,
          });
          break;
        case 'append_to_manuscript':
          result = await brain.actions.appendText(
            args.text_to_add as string,
            args.description as string
          );
          break;
        case 'insert_at_cursor':
          result = await brain.actions.appendText(args.text as string, args.description as string);
          break;
        case 'undo_last_change':
          result = await brain.actions.undo();
          break;
        case 'redo_last_change':
          result = await brain.actions.redo();
          break;
          
        // Analysis
        case 'get_critique_for_selection':
          result = await brain.actions.getCritiqueForSelection(args.focus as string);
          break;
        case 'run_analysis':
          result = await brain.actions.runAnalysis(args.section as string);
          break;
          
        // UI Control
        case 'switch_panel':
          brain.actions.switchPanel(args.panel as string);
          result = `Switched to ${args.panel} panel`;
          break;
        case 'toggle_zen_mode':
          brain.actions.toggleZenMode();
          result = 'Toggled Zen mode';
          break;
        case 'highlight_text':
          brain.actions.highlightText(
            args.start as number,
            args.end as number,
            args.style as string
          );
          result = `Highlighted text at ${args.start}-${args.end}`;
          break;
          
        // Knowledge
        case 'query_lore':
          result = await brain.actions.queryLore(args.query as string);
          break;
        case 'get_character_info':
          result = await brain.actions.getCharacterInfo(args.name as string);
          break;
        case 'get_timeline_context':
          result = await brain.actions.getTimelineContext(args.range as any);
          break;
          
        // Generation
        case 'rewrite_selection':
          result = await brain.actions.rewriteSelection({
            mode: args.mode as any,
            targetTone: args.target_tone as string,
          });
          break;
          
        default:
          result = `Unknown tool: ${toolName}`;
      }
      
      emitToolExecuted(toolName, true);
      setState(s => ({ ...s, lastToolCall: { name: toolName, success: true } }));
      return result;
      
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      emitToolExecuted(toolName, false);
      setState(s => ({ 
        ...s, 
        status: 'error', 
        lastError: error,
        lastToolCall: { name: toolName, success: false }
      }));
      return `Error executing ${toolName}: ${error}`;
    }
  }, [brain.actions]);

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
    setIsProcessing(true);
    setState({ status: 'thinking' });

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
        
        setState({ status: 'thinking' });
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
      setState({ status: 'idle' });

    } catch (e) {
      if (signal.aborted) return;
      
      console.error('[AgentOrchestrator] Error:', e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      setState({ status: 'error', lastError: errorMessage });
      
      setMessages(prev => [...prev, {
        role: 'model',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      if (!signal.aborted) {
        setIsProcessing(false);
      }
    }
  }, [brain.state, brain.context, executeToolCall]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL METHODS
  // ─────────────────────────────────────────────────────────────────────────

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsProcessing(false);
    setState({ status: 'idle' });
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
    state,
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
