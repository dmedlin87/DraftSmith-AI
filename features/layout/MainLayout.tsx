import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SidebarTab, MainView, CharacterProfile } from '@/types';
import { ProjectSidebar, StoryBoard, useProjectStore } from '@/features/project';
import { EditorWorkspace } from '@/features/editor';
import { UploadLayout } from './UploadLayout';
import { ChatInterface, ActivityFeed, AIPresenceOrb, type OrbStatus } from '@/features/agent';
import { DEFAULT_PERSONAS } from '@/types/personas';
import { VoiceMode } from '@/features/voice';
import { useEditor, useEngine, UsageBadge } from '@/features/shared';
import { Dashboard } from '@/features/analysis';
import { KnowledgeGraph, LoreManager } from '@/features/lore';

/**
 * Derive orb status from engine state
 */
function deriveOrbStatus(isAnalyzing: boolean, isMagicLoading: boolean): OrbStatus {
  if (isMagicLoading) return 'writing';
  if (isAnalyzing) return 'thinking';
  return 'idle';
}

// Nav Icons
const Icons = {
  Zen: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/><path d="M12 8v-4"/><path d="M12 20v-4"/><path d="M8 12H4"/><path d="M20 12h-4"/></svg>,
  Exit: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>,
  Home: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Analysis: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  Agent: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  History: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>,
  Mic: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  Wand: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2.5l5 5"/><path d="M2.5 19.5l9.5-9.5"/><path d="M7 6l1 1"/><path d="M14 4l.5.5"/><path d="M17 7l-.5.5"/><path d="M4 9l.5.5"/></svg>,
  Graph: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  Book: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  Board: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Sun: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>,
  Moon: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
};

export const MainLayout: React.FC = () => {
  // Consume contexts directly - no more prop drilling
  const { currentProject, getActiveChapter, chapters } = useProjectStore();
  const { currentText, selectionRange, history, restore, editor, isZenMode, toggleZenMode } = useEditor();
  const { state: engineState, actions: engineActions } = useEngine();

  const activeChapter = getActiveChapter();

  // UI State (local to this layout)
  const [activeTab, setActiveTab] = useState<SidebarTab>(SidebarTab.ANALYSIS);
  const [activeView, setActiveView] = useState<MainView>(MainView.EDITOR);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isToolsCollapsed, setIsToolsCollapsed] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [selectedGraphCharacter, setSelectedGraphCharacter] = useState<CharacterProfile | null>(null);
  const [interviewTarget, setInterviewTarget] = useState<CharacterProfile | null>(null);
  const [isExitZenHovered, setIsExitZenHovered] = useState(false);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [currentPersonaIndex, setCurrentPersonaIndex] = useState(0);
  const currentPersona = DEFAULT_PERSONAS[currentPersonaIndex];
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('quillai-theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('quillai-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // If no project is selected, show Dashboard/Upload
  if (!currentProject) {
    return <UploadLayout />;
  }

  const editorContext = {
    cursorPosition: editor?.state.selection.from || 0,
    selection: selectionRange,
    totalLength: currentText.length
  };

  const handleTabChange = (tab: SidebarTab) => {
    setActiveTab(tab);
    setIsToolsCollapsed(false);
  };

  // Smart Apply: Handle fix request from Analysis panel
  const handleFixRequest = (issueContext: string, suggestion: string) => {
    const prompt = `I need to fix an issue. Context: ${issueContext}. Suggestion: ${suggestion}. Please locate this in the text and rewrite it using the update_manuscript tool.`;
    setChatInitialMessage(prompt);
    setActiveTab(SidebarTab.CHAT);
    setIsToolsCollapsed(false);
  };

  const handleInitialMessageProcessed = () => {
    setChatInitialMessage(undefined);
  };

  const handleHomeClick = () => {
     window.location.reload(); 
  };

  const handleSelectGraphCharacter = (character: CharacterProfile) => {
    setSelectedGraphCharacter(character);
    setActiveTab(SidebarTab.LORE);
  };

  const handleInterviewCharacter = (character: CharacterProfile) => {
    setInterviewTarget(character);
    setActiveTab(SidebarTab.CHAT);
    setIsToolsCollapsed(false);
  };

  const handleExitInterview = () => {
    setInterviewTarget(null);
  };

  const handleSwitchToEditor = () => {
    setActiveView(MainView.EDITOR);
  };

  return (
    <div className="flex w-full h-full bg-[var(--surface-tertiary)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      
      {/* 1. Navigation Rail */}
      <motion.nav
        animate={{
          x: isZenMode ? -80 : 0,
          opacity: isZenMode ? 0 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-16 bg-[var(--nav-bg)] border-r border-[var(--border-primary)] flex flex-col items-center py-6 gap-2 shrink-0 z-40"
        style={{ pointerEvents: isZenMode ? 'none' : 'auto' }}
      >
        <button
          onClick={handleHomeClick}
          className="w-10 h-10 rounded-xl bg-[var(--interactive-accent)] text-[var(--text-inverse)] flex items-center justify-center shadow-md mb-4 hover:scale-105 transition-transform"
          title="Library"
        >
          <Icons.Wand />
        </button>
        
        {/* View Toggle */}
        <button
          onClick={() => setActiveView(activeView === MainView.EDITOR ? MainView.STORYBOARD : MainView.EDITOR)}
          title={activeView === MainView.EDITOR ? "Story Board" : "Editor"}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all mb-2 ${
            activeView === MainView.STORYBOARD
              ? 'bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)]'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Icons.Board />
        </button>

        <div className="w-8 border-t border-[var(--border-primary)] mb-2" />

        {/* AIPresenceOrb replaces static Agent icon */}
        <AIPresenceOrb
          status={deriveOrbStatus(engineState.isAnalyzing, engineState.isMagicLoading)}
          persona={currentPersona}
          analysisReady={Boolean(activeChapter?.lastAnalysis)}
          onClick={() => handleTabChange(SidebarTab.CHAT)}
          isActive={activeTab === SidebarTab.CHAT}
        />

        {[
          { tab: SidebarTab.ANALYSIS, icon: <Icons.Analysis />, label: "Analysis" },
          { tab: SidebarTab.HISTORY, icon: <Icons.History />, label: "History" },
          { tab: SidebarTab.VOICE, icon: <Icons.Mic />, label: "Voice" },
          { tab: SidebarTab.GRAPH, icon: <Icons.Graph />, label: "Graph" },
          { tab: SidebarTab.LORE, icon: <Icons.Book />, label: "Lore Bible" }
        ].map(item => (
          <button
            key={item.tab}
            onClick={() => handleTabChange(item.tab)}
            title={item.label}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all relative ${
              activeTab === item.tab 
                ? 'bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)]' 
                : 'text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {item.icon}
            {activeTab === item.tab && (
              <div className="absolute right-[-13px] top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--interactive-accent)] rounded-l-sm" />
            )}
          </button>
        ))}

        <div className="mt-auto flex flex-col items-center gap-2">
          {/* Zen Mode Toggle */}
          <button
            onClick={toggleZenMode}
            title="Enter Zen Mode"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--interactive-accent)] transition-all"
          >
            <Icons.Zen />
          </button>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--interactive-accent)] transition-all"
          >
            {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
          </button>
        </div>
      </motion.nav>

      {/* 2. Chapter Sidebar */}
      <AnimatePresence mode="wait">
        {!isSidebarCollapsed && !isZenMode && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="shrink-0 overflow-hidden"
          >
            <ProjectSidebar 
              collapsed={isSidebarCollapsed} 
              toggleCollapsed={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Main Content Area */}
      {activeView === MainView.STORYBOARD ? (
        <StoryBoard onSwitchToEditor={handleSwitchToEditor} />
      ) : (
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-500 ${isZenMode ? 'items-center' : ''}`}>
          {/* Header - Auto-hide in Zen Mode */}
          <motion.div
            initial={false}
            animate={{
              y: isZenMode && !isHeaderHovered ? -60 : 0,
              opacity: isZenMode && !isHeaderHovered ? 0 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex items-center justify-between px-6 py-2 bg-[var(--surface-primary)] border-b border-[var(--border-primary)] shrink-0"
            style={{ 
              position: isZenMode ? 'fixed' : 'relative',
              top: 0,
              left: isZenMode ? 0 : 'auto',
              right: isZenMode ? 0 : 'auto',
              zIndex: isZenMode ? 50 : 'auto',
            }}
            onMouseEnter={() => isZenMode && setIsHeaderHovered(true)}
            onMouseLeave={() => setIsHeaderHovered(false)}
          >
              <div className="flex items-center gap-4">
                  <UsageBadge />
              </div>
          </motion.div>
          {/* Invisible hover zone at top for Zen Mode header */}
          {isZenMode && (
            <div 
              className="fixed top-0 left-0 right-0 h-8 z-40"
              onMouseEnter={() => setIsHeaderHovered(true)}
            />
          )}
          <EditorWorkspace />
        </div>
      )}

      {/* 4. Tools Panel - Glassmorphism + Animated */}
      <AnimatePresence mode="wait">
        {!isToolsCollapsed && !isZenMode && (
          <motion.aside
            initial={{ width: 0, opacity: 0, x: 50 }}
            animate={{ width: 380, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: 50 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="glass-strong border-l-0 flex flex-col z-30 shrink-0 overflow-hidden"
          >
            <div className="h-14 border-b border-[var(--glass-border)] flex items-center px-5 shrink-0">
              <h3 className="text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                {activeTab}
              </h3>
            </div>
            <div className="flex-1 overflow-hidden relative">
              {activeTab === SidebarTab.ANALYSIS && (
                <Dashboard 
                   isLoading={engineState.isAnalyzing}
                   analysis={activeChapter?.lastAnalysis || null}
                   currentText={currentText}
                   onFixRequest={handleFixRequest}
                   warning={engineState.analysisWarning}
                />
              )}
              {activeTab === SidebarTab.CHAT && (
                <ChatInterface 
                  editorContext={editorContext} 
                  fullText={currentText} 
                  onAgentAction={engineActions.handleAgentAction} 
                  lore={currentProject?.lore}
                  chapters={chapters}
                  analysis={activeChapter?.lastAnalysis}
                  initialMessage={chatInitialMessage}
                  onInitialMessageProcessed={handleInitialMessageProcessed}
                  interviewTarget={interviewTarget}
                  onExitInterview={handleExitInterview}
                />
              )}
              {activeTab === SidebarTab.HISTORY && (
                 <ActivityFeed 
                   history={history} 
                   onRestore={restore} 
                   onInspect={(item) => console.log('Inspect', item)} 
                 />
              )}
              {activeTab === SidebarTab.VOICE && <VoiceMode />}
              {activeTab === SidebarTab.GRAPH && (
                <KnowledgeGraph onSelectCharacter={handleSelectGraphCharacter} />
              )}
              {activeTab === SidebarTab.LORE && (
                <LoreManager onInterviewCharacter={handleInterviewCharacter} />
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Floating Exit Zen Mode Button */}
      <AnimatePresence>
        {isZenMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ 
              opacity: isExitZenHovered ? 1 : 0.3, 
              scale: isExitZenHovered ? 1 : 0.9,
              y: 0 
            }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed bottom-6 right-6 z-50"
            onMouseEnter={() => setIsExitZenHovered(true)}
            onMouseLeave={() => setIsExitZenHovered(false)}
          >
            <button
              onClick={toggleZenMode}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-primary)] border border-[var(--border-primary)] shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-[var(--surface-secondary)]"
            >
              <Icons.Exit />
              <span className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">
                Exit Zen
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
