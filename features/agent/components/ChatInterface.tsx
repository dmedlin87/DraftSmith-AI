import React, { useState, useEffect, useRef } from 'react';

import { motion, AnimatePresence } from 'framer-motion';

import { ChatMessage, EditorContext, AnalysisResult, CharacterProfile } from '@/types';



// Message animation variants

const messageVariants = {

  hidden: { opacity: 0, y: 20, scale: 0.95 },

  visible: { 

    opacity: 1, 

    y: 0, 

    scale: 1,

    transition: { type: 'spring' as const, stiffness: 400, damping: 30 }

  },

  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }

};

import { createAgentSession } from '@/services/gemini/agent';

import { Chat } from "@google/genai";

import { Lore, Chapter } from '@/types/schema';

import { Persona, DEFAULT_PERSONAS } from '@/types/personas';

import { PersonaSelector } from './PersonaSelector';

import { CritiqueIntensitySelector, ExperienceSelector, useSettingsStore } from '@/features/settings';



interface ChatInterfaceProps {

  editorContext: EditorContext;

  fullText: string;

  onAgentAction: (action: string, params: any) => Promise<string>; // callback to App.tsx

  lore?: Lore;

  chapters?: Chapter[];

  analysis?: AnalysisResult | null;

  initialMessage?: string;

  onInitialMessageProcessed?: () => void;

  initialPersona?: Persona;

  interviewTarget?: CharacterProfile | null;

  onExitInterview?: () => void;

}



export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 

    editorContext, 

    fullText, 

    onAgentAction, 

    lore,

  chapters = [],

  analysis,

  initialMessage,

  onInitialMessageProcessed,

  initialPersona,

  interviewTarget = null,

  onExitInterview,

}) => {

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  const [agentState, setAgentState] = useState<'idle' | 'thinking' | 'writing'>('idle');

  const [currentPersona, setCurrentPersona] = useState<Persona>(initialPersona || DEFAULT_PERSONAS[0]);

  

  const chatRef = useRef<Chat | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const personaRef = useRef<Persona>(currentPersona);

  const isInterviewMode = Boolean(interviewTarget);



  // Initialize Chat Session

  const initializeSession = () => {

    // Construct a single string containing all chapters for context

    const fullManuscript = chapters.map(c => {

       // Check if this is the active chapter by comparing text content (simple heuristic) or ID if we had it here

       const isActive = c.content === fullText;

       return `[CHAPTER: ${c.title}]${isActive ? " (ACTIVE - You can edit this)" : " (READ ONLY - Request user to switch)"}\n${c.content}\n`;

    }).join('\n-------------------\n');



    const { critiqueIntensity, experienceLevel, autonomyMode } = useSettingsStore.getState();

    const personaForSession = isInterviewMode ? undefined : personaRef.current;

    chatRef.current = createAgentSession(

      lore, 

      analysis || undefined, 

      fullManuscript, 

      personaForSession, 

      critiqueIntensity,

      experienceLevel,

      autonomyMode,

      undefined,

      interviewTarget || undefined

    );

    

    // Initialize with instructions but no visible message

    const init = async () => {

       const intro = isInterviewMode && interviewTarget

        ? `I have loaded the manuscript. Total Chapters: ${chapters.length}. Active Chapter Length: ${fullText.length} characters. I am ${interviewTarget.name}, speaking in interview mode. Ask me anything about my story or choices.`

        : `I have loaded the manuscript. Total Chapters: ${chapters.length}. Active Chapter Length: ${fullText.length} characters. I am ${personaRef.current.name}, ready to help with my ${personaRef.current.role} expertise.`;

       await chatRef.current?.sendMessage({ 

           message: intro

       });

    };

    init();

  };



  useEffect(() => {

    initializeSession();

  }, [lore, analysis, chapters, fullText, interviewTarget]);



  // Handle persona change

  const handlePersonaChange = (persona: Persona) => {
    onExitInterview?.();
    setCurrentPersona(persona);
    personaRef.current = persona;
    chatRef.current = null; // Force reinitialization
    initializeSession();

    setMessages(prev => [...prev, {

      role: 'model',
      text: `${persona.icon} Switching to ${persona.name} mode. ${persona.role}.`,
      timestamp: new Date()
    }]);
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentState]);

  // Handle initial message from Smart Apply
  useEffect(() => {
    if (initialMessage && chatRef.current && !isLoading) {
      setInput(initialMessage);
      // Auto-send after a brief delay to ensure UI is ready
      const timer = setTimeout(() => {
        sendMessageWithText(initialMessage);
        if (onInitialMessageProcessed) {
          onInitialMessageProcessed();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialMessage]);

  const sendMessageWithText = async (messageText: string) => {
    if (!messageText.trim() || !chatRef.current) return;

    const userMsg: ChatMessage = { role: 'user', text: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setAgentState('thinking');

    try {
      // 1. Construct Context-Aware Prompt
      const contextPrompt = `
      [USER CONTEXT]
      Cursor Index: ${editorContext.cursorPosition}
      Selection: ${editorContext.selection ? `"${editorContext.selection.text}"` : "None"}
      Total Text Length: ${editorContext.totalLength}
      
      [USER REQUEST]
      ${messageText}
      `;

      // 2. Send to Gemini
      let result = await chatRef.current.sendMessage({ message: contextPrompt });
      
      // 3. Handle Tool Calls Loop
      while (result.functionCalls && result.functionCalls.length > 0) {
        setAgentState('writing');
        const functionResponses = [];

        for (const call of result.functionCalls) {
           // Display a "Tool Use" message in UI
           setMessages(prev => [...prev, {
             role: 'model',
             text: `🛠️ Suggesting Action: ${call.name}...`,
             timestamp: new Date()
           }]);

           try {
             // Execute Action (This now triggers the Global Review Modal if needed)
             const actionResult = await onAgentAction(call.name, call.args);
             
             functionResponses.push({
               id: call.id,
               name: call.name,
               response: { result: actionResult } 
             });

             // Add success/status message
             if (actionResult.includes('Waiting for user review')) {
                setMessages(prev => [...prev, {
                    role: 'model',
                    text: `📝 Reviewing proposed edit...`,
                    timestamp: new Date()
                }]);
             }

           } catch (err: any) {
             const errorMsg = err.message || "Unknown error";
             
             setMessages(prev => [...prev, {
                role: 'model',
                text: `❌ Error: ${errorMsg}`,
                timestamp: new Date()
            }]);

             functionResponses.push({
               id: call.id,
               name: call.name,
               response: { result: errorMsg } 
             });
           }
        }

        // Send tool results back to model
        setAgentState('thinking');
        result = await chatRef.current.sendMessage({
           message: functionResponses.map(resp => ({ functionResponse: resp }))
        });
      }

      // 4. Final Text Response
      const responseText = result.text;
      setMessages(prev => [...prev, {
        role: 'model',
        text: responseText || "Done.",
        timestamp: new Date()
      }]);

    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        role: 'model',
        text: "Sorry, I encountered an error connecting to the Agent.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setAgentState('idle');
    }
  };

  const sendMessage = () => {
    sendMessageWithText(input);
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Agent Header - Persona & Context */}
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 space-y-2">
        {/* Persona Selector Row */}
        <div className="flex items-center justify-between">
          {isInterviewMode && interviewTarget ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 px-3 py-2 bg-[var(--magic-50)] border border-[var(--magic-200)] rounded-lg">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--magic-300)] to-[var(--magic-500)] text-white flex items-center justify-center font-semibold">
                  {interviewTarget.name.charAt(0).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--magic-700)] font-semibold">Roleplay Active</div>
                  <div className="text-sm font-semibold text-[var(--ink-800)]">{interviewTarget.name}</div>
                </div>
              </div>
              {onExitInterview && (
                <button
                  onClick={onExitInterview}
                  className="text-xs px-3 py-2 border border-[var(--magic-300)] text-[var(--magic-700)] rounded-md hover:bg-[var(--magic-50)] transition-colors"
                >
                  Exit Interview
                </button>
              )}
            </div>
          ) : (
            <PersonaSelector
              currentPersona={currentPersona}
              onSelectPersona={handlePersonaChange}
              compact
            />
          )}
          <div className="flex items-center gap-2">
            <ExperienceSelector compact />
            <div className="w-px h-4 bg-gray-300" />
            <CritiqueIntensitySelector compact />
            <div className="flex gap-2 text-xs ml-1">
              {lore && <span title="Lore Bible Active" className="text-indigo-600 font-bold">📖</span>}
              {analysis && <span title="Deep Analysis Context Active" className="text-purple-600 font-bold">🧠</span>}
            </div>
          </div>
        </div>
        {/* Context Row */}
        <div className="flex items-center justify-between text-xs text-gray-500">
           <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${editorContext.selection ? 'bg-indigo-500' : 'bg-gray-300'}`}></div>
              <span>{editorContext.selection ? 'Selection Active' : 'Cursor Active'}</span>
           </div>
           <div className="font-mono">
              Ln {Math.floor(editorContext.cursorPosition / 80) + 1} : Col {editorContext.cursorPosition % 80}
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence mode="popLayout">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const showCharacterAvatar = isInterviewMode && msg.role === 'model' && interviewTarget;

            return (
              <motion.div 
                key={`${idx}-${msg.role}`}
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <motion.div className={`flex ${showCharacterAvatar ? 'gap-2' : ''} max-w-[90%]`}>
                  {showCharacterAvatar && (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--magic-300)] to-[var(--magic-500)] text-white flex items-center justify-center font-semibold">
                        {interviewTarget?.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[10px] text-[var(--ink-400)] leading-none">{interviewTarget?.name}</span>
                    </div>
                  )}
                  <motion.div 
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {msg.text}
                  </motion.div>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Loading / State Indicators */}
        <AnimatePresence>
          {agentState !== 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-start"
            >
              <div className="bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded-2xl px-4 py-3 rounded-bl-none flex items-center gap-3">
                 <div className="flex space-x-1">
                   <motion.div 
                     className="w-2 h-2 bg-[var(--interactive-accent)] rounded-full"
                     animate={{ y: [0, -6, 0] }}
                     transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                   />
                   <motion.div 
                     className="w-2 h-2 bg-[var(--interactive-accent)] rounded-full"
                     animate={{ y: [0, -6, 0] }}
                     transition={{ duration: 0.6, repeat: Infinity, delay: 0.1 }}
                   />
                   <motion.div 
                     className="w-2 h-2 bg-[var(--interactive-accent)] rounded-full"
                     animate={{ y: [0, -6, 0] }}
                     transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                   />
                 </div>
                 <span className="text-xs text-[var(--interactive-accent)] font-medium">
                    {agentState === 'thinking' ? 'Reasoning...' : 'Editing Manuscript...'}
                 </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-100 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow disabled:bg-gray-100 disabled:text-gray-400"
            placeholder="Type / to use tools or ask Agent to edit..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={isLoading}
          />
          <button 
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="bg-indigo-600 text-white rounded-lg p-3 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </div>
        <div className="text-[10px] text-gray-400 mt-2 text-center">
            Agent can read your selection and edit text directly.
        </div>
      </div>
    </div>
  );
};
