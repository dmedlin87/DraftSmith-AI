import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppMode, SidebarTab, AnalysisResult, EditorContext, HighlightRange } from './types';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatInterface } from './components/ChatInterface';
import { VoiceMode } from './components/VoiceMode';
import { MagicBar } from './components/MagicBar';
import { ActivityFeed } from './components/ActivityFeed';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ProjectDashboard } from './components/ProjectDashboard';
import { analyzeDraft, rewriteText, getContextualHelp } from './services/geminiService';
import { useDocumentHistory } from './hooks/useDocumentHistory';
import { useTextSelection } from './hooks/useTextSelection';
import { useAutoResize } from './hooks/useAutoResize';
import { useProjectStore } from './store/useProjectStore';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  
  // Store Access
  const { 
      init: initStore,
      currentProject, 
      activeChapterId, 
      updateChapterContent,
      updateChapterAnalysis,
      getActiveChapter,
      isLoading: isStoreLoading
  } = useProjectStore();

  const activeChapter = getActiveChapter();

  // Load Initial State
  useEffect(() => {
      initStore();
  }, [initStore]);

  // Determine App Mode based on store state
  useEffect(() => {
      if (currentProject) {
          setMode(AppMode.EDITOR);
      } else {
          setMode(AppMode.UPLOAD); 
      }
  }, [currentProject]);

  // Hook into document history with the ACTIVE chapter
  const handleSaveContent = useCallback((text: string) => {
      if (activeChapterId) {
          updateChapterContent(activeChapterId, text);
      }
  }, [activeChapterId, updateChapterContent]);

  const { text: currentText, updateText, commit, history, restore } = useDocumentHistory(
      activeChapter?.content || '', 
      activeChapterId, 
      handleSaveContent
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const { selection: selectionRange, position: selectionPos, cursorPosition, handleSelectionChange, handleMouseUp, clearSelection } = useTextSelection(textareaRef);
  useAutoResize(textareaRef, currentText, mode);

  // Layout State
  const [activeTab, setActiveTab] = useState<SidebarTab>(SidebarTab.ANALYSIS);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isToolsCollapsed, setIsToolsCollapsed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Magic Editor States
  const [magicVariations, setMagicVariations] = useState<string[]>([]);
  const [magicHelpResult, setMagicHelpResult] = useState<string | undefined>(undefined);
  const [magicHelpType, setMagicHelpType] = useState<'Explain' | 'Thesaurus' | null>(null);
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const magicAbortRef = useRef<AbortController | null>(null);

  // Highlighting State
  const [activeHighlight, setActiveHighlight] = useState<HighlightRange | null>(null);

  // Sync scroll for backdrop highlighting
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleNavigateToIssue = (start: number, end: number) => {
    // 1. Set highlight
    setActiveHighlight({ start, end, type: 'issue' });

    // 2. Focus and Select
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
      
      // 3. Scroll into view (basic approx)
      const lineHeight = 32; // Approx line height in px
      const lines = currentText.substring(0, start).split('\n').length;
      const scrollY = (lines - 1) * lineHeight;
      textareaRef.current.scrollTop = Math.max(0, scrollY - 100); // center a bit
      if (backdropRef.current) backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Cleanup magic async on unmount
  useEffect(() => {
      return () => {
          if (magicAbortRef.current) magicAbortRef.current.abort();
      };
  }, []);

  const handleAgentAction = async (action: string, params: any): Promise<string> => {
    if (action === 'update_manuscript') {
        const { search_text, replacement_text, description } = params;
        
        const occurrences = currentText.split(search_text).length - 1;
        if (occurrences === 0) {
            throw new Error("Could not find the exact text to replace. Please be more specific.");
        }
        if (occurrences > 1) {
             throw new Error(`Found ${occurrences} matches for that text. Please provide more context.`);
        }

        const newText = currentText.replace(search_text, replacement_text);
        commit(newText, description || "Agent Edit", 'Agent');
        return "Success: Text updated.";
    } 
    
    if (action === 'append_to_manuscript') {
        const { text_to_add, description } = params;
        const newText = currentText + "\n" + text_to_add;
        commit(newText, description || "Agent Append", 'Agent');
        return "Success: Text appended.";
    }

    if (action === 'undo_last_change') {
         return "Use the interface undo button for now.";
    }

    return "Unknown action.";
  };
  
  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateText(e.target.value);
      // Clear highlights on edit to avoid mismatches
      if (activeHighlight) setActiveHighlight(null);
  };

  const runAnalysis = async () => {
    if (!currentText.trim() || !activeChapterId) return;
    setIsAnalyzing(true);
    setActiveTab(SidebarTab.ANALYSIS);
    setIsToolsCollapsed(false);
    setActiveHighlight(null);
    try {
      const result = await analyzeDraft(currentText, currentProject?.setting);
      await updateChapterAnalysis(activeChapterId, result);
    } catch (e) {
      console.error("Analysis failed", e);
      alert("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRewrite = async (mode: string, tone?: string) => {
    if (!selectionRange) return;
    setIsMagicLoading(true);
    setMagicHelpResult(undefined); 
    setMagicHelpType(null);
    magicAbortRef.current = new AbortController();
    
    try {
        const variations = await rewriteText(selectionRange.text, mode, tone, currentProject?.setting);
        if (!magicAbortRef.current?.signal.aborted) {
             setMagicVariations(variations);
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (!magicAbortRef.current?.signal.aborted) {
            setIsMagicLoading(false);
        }
    }
  };

  const handleHelp = async (type: 'Explain' | 'Thesaurus') => {
      if (!selectionRange) return;
      setIsMagicLoading(true);
      setMagicVariations([]);
      setMagicHelpResult(undefined);
      setMagicHelpType(type);
      magicAbortRef.current = new AbortController();
      
      try {
          const result = await getContextualHelp(selectionRange.text, type);
          if (!magicAbortRef.current?.signal.aborted) {
              setMagicHelpResult(result);
          }
      } catch (e) {
          console.error(e);
      } finally {
         if (!magicAbortRef.current?.signal.aborted) {
             setIsMagicLoading(false);
         }
      }
  };

  const applyVariation = (newText: string) => {
    if (!selectionRange) return;
    const before = currentText.substring(0, selectionRange.start);
    const after = currentText.substring(selectionRange.end);
    const updated = before + newText + after;
    
    commit(updated, `Magic Edit: ${magicVariations.length > 0 ? 'Variation Applied' : 'Context Replacement'}`, 'User');
    closeMagicBar();
  };

  const closeMagicBar = () => {
    if (magicAbortRef.current) magicAbortRef.current.abort();
    clearSelection();
    setMagicVariations([]);
    setMagicHelpResult(undefined);
    setMagicHelpType(null);
  };
  
  const editorContext: EditorContext = {
      cursorPosition,
      selection: selectionRange,
      totalLength: currentText.length
  };

  if (isStoreLoading) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-gray-50 text-indigo-600">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="font-serif font-medium">Loading your library...</p>
              </div>
          </div>
      );
  }

  // Render Highlight Backdrop
  const renderHighlights = () => {
    if (!activeHighlight) return currentText;
    
    const { start, end } = activeHighlight;
    const before = currentText.substring(0, start);
    const highlight = currentText.substring(start, end);
    const after = currentText.substring(end);
    
    // Determine color based on type (default yellow for general issues, purple for settings)
    const highlightClass = activeHighlight.type === 'issue' // We reuse 'issue' for settings now in logic, but let's be explicit if we expanded types
        ? 'bg-purple-200/50 border-b-2 border-purple-400' 
        : 'bg-yellow-200/50 border-b-2 border-yellow-400';

    return (
      <>
        {before}
        <span className={highlightClass}>{highlight}</span>
        {after}
      </>
    );
  };

  return (
    <div className="flex h-screen w-full bg-[#f3f4f6] text-gray-900 font-sans">
      
      {mode === AppMode.UPLOAD && <ProjectDashboard />}

      {mode === AppMode.EDITOR && (
        <div className="flex w-full h-full">
            {/* 1. Icon Navigation Rail */}
            <aside className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-6 space-y-4 z-40 shadow-sm shrink-0">
                <div 
                    onClick={() => setMode(AppMode.UPLOAD)}
                    className="p-2 mb-4 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 cursor-pointer hover:scale-105 transition-transform"
                    title="Library"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                    </svg>
                </div>

                {[
                    { tab: SidebarTab.ANALYSIS, icon: "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" },
                    { tab: SidebarTab.CHAT, icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" },
                    { tab: SidebarTab.HISTORY, icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
                    { tab: SidebarTab.VOICE, icon: "M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" }
                ].map(item => (
                    <button 
                      key={item.tab}
                      onClick={() => {
                          setActiveTab(item.tab);
                          setIsToolsCollapsed(false);
                      }}
                      className={`p-3 rounded-xl transition-all duration-200 group relative ${activeTab === item.tab && !isToolsCollapsed ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                    </button>
                ))}
            </aside>

            {/* 2. Project Sidebar */}
            <ProjectSidebar 
                collapsed={isSidebarCollapsed} 
                toggleCollapsed={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            />

            {/* 3. Main Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#e5e7eb] relative">
               <header className="h-14 border-b border-gray-200/50 flex items-center justify-between px-6 bg-white/80 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
                 <div className="flex items-center gap-2">
                     <h2 className="font-serif font-bold text-gray-800 text-lg">{activeChapter?.title || 'No Active Chapter'}</h2>
                     {currentProject?.setting && (
                         <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full ml-2">
                             <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                             {currentProject.setting.timePeriod} in {currentProject.setting.location}
                         </span>
                     )}
                 </div>
                 <div className="flex items-center gap-3">
                     <button 
                       onClick={runAnalysis} 
                       disabled={isAnalyzing}
                       className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-indigo-200"
                     >
                       {isAnalyzing ? "Analyzing..." : "Deep Analysis"}
                     </button>
                     <button
                        onClick={() => setIsToolsCollapsed(!isToolsCollapsed)}
                        className={`p-1.5 rounded-md hover:bg-gray-100 text-gray-500 ${isToolsCollapsed ? 'rotate-180' : ''}`}
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                        </svg>
                     </button>
                 </div>
               </header>
               
               <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8 relative" onClick={clearSelection}>
                  <div className="max-w-3xl mx-auto bg-white min-h-[calc(100vh-8rem)] shadow-2xl rounded-sm border border-gray-200/50 paper-shadow relative" onClick={(e) => e.stopPropagation()}>
                    <div className="relative p-12 md:p-16">
                         
                         {/* Backdrop for Highlights - Must match Textarea styling EXACTLY */}
                         <div 
                            ref={backdropRef}
                            className="absolute top-0 left-0 right-0 bottom-0 p-12 md:p-16 pointer-events-none overflow-hidden whitespace-pre-wrap font-serif text-xl leading-loose text-transparent z-0"
                            aria-hidden="true"
                         >
                            {renderHighlights()}
                         </div>

                         {/* Actual Editor */}
                         <textarea 
                            ref={textareaRef}
                            className="relative z-10 w-full min-h-[60vh] resize-none outline-none border-none bg-transparent font-serif text-gray-800 text-xl leading-loose placeholder-gray-300 block overflow-hidden whitespace-pre-wrap"
                            value={currentText}
                            onChange={handleEditorChange}
                            onSelect={handleSelectionChange}
                            onMouseUp={handleMouseUp}
                            onKeyUp={handleSelectionChange}
                            onClick={handleSelectionChange}
                            onScroll={handleScroll}
                            placeholder="Select a chapter and start writing..."
                            spellCheck={false}
                         />
                    </div>
                    {selectionRange && selectionPos && (
                       <MagicBar 
                         isLoading={isMagicLoading} 
                         variations={magicVariations} 
                         helpResult={magicHelpResult}
                         helpType={magicHelpType}
                         onRewrite={handleRewrite}
                         onHelp={handleHelp}
                         onApply={applyVariation}
                         onClose={closeMagicBar}
                         position={selectionPos}
                       />
                    )}
                  </div>
                  <div className="h-16"></div>
               </div>
            </div>

            {/* 4. Right Tools Panel */}
            {!isToolsCollapsed && (
                <div className="w-[400px] bg-white border-l border-gray-200 flex flex-col shadow-xl z-30 shrink-0">
                    <div className="h-14 border-b border-gray-100 flex items-center px-4 bg-gray-50/50 shrink-0">
                         <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
                            {activeTab === SidebarTab.ANALYSIS && "Analysis Report"}
                            {activeTab === SidebarTab.CHAT && "Editor Agent"}
                            {activeTab === SidebarTab.HISTORY && "History"}
                            {activeTab === SidebarTab.VOICE && "Live Session"}
                         </h3>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {activeTab === SidebarTab.ANALYSIS && (
                            <AnalysisPanel 
                                analysis={activeChapter?.lastAnalysis || null} 
                                isLoading={isAnalyzing} 
                                currentText={currentText}
                                onNavigate={handleNavigateToIssue} 
                            />
                        )}
                        {activeTab === SidebarTab.CHAT && (
                            <ChatInterface editorContext={editorContext} fullText={currentText} onAgentAction={handleAgentAction} />
                        )}
                        {activeTab === SidebarTab.HISTORY && (
                            <ActivityFeed history={history} onRestore={restore} />
                        )}
                        {activeTab === SidebarTab.VOICE && (
                            <VoiceMode />
                        )}
                    </div>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default App;