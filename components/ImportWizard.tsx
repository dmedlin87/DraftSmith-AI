import React, { useState, useRef, useEffect } from 'react';
import { ParsedChapter } from '../services/manuscriptParser';

interface Props {
  initialChapters: ParsedChapter[];
  onConfirm: (chapters: ParsedChapter[]) => void;
  onCancel: () => void;
}

export const ImportWizard: React.FC<Props> = ({ initialChapters, onConfirm, onCancel }) => {
  const [chapters, setChapters] = useState<ParsedChapter[]>(initialChapters);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Ref for the text area to capture cursor position for splitting
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedChapter = chapters[selectedIndex];

  // Update title of selected chapter
  const handleTitleChange = (newTitle: string) => {
    const updated = [...chapters];
    updated[selectedIndex] = { ...updated[selectedIndex], title: newTitle };
    setChapters(updated);
  };

  // Update content of selected chapter
  const handleContentChange = (newContent: string) => {
    const updated = [...chapters];
    updated[selectedIndex] = { ...updated[selectedIndex], content: newContent };
    setChapters(updated);
  };

  const handleMergeUp = () => {
    if (selectedIndex === 0) return;
    const prevIndex = selectedIndex - 1;
    const prevChapter = chapters[prevIndex];
    const currentChapter = chapters[selectedIndex];

    const updated = [...chapters];
    // Merge current content into previous
    updated[prevIndex] = {
      ...prevChapter,
      content: `${prevChapter.content}\n\n${currentChapter.content}`
    };
    // Remove current
    updated.splice(selectedIndex, 1);
    
    setChapters(updated);
    setSelectedIndex(prevIndex);
  };

  const handleMergeDown = () => {
    if (selectedIndex === chapters.length - 1) return;
    const nextIndex = selectedIndex + 1;
    const currentChapter = chapters[selectedIndex];
    const nextChapter = chapters[nextIndex];

    const updated = [...chapters];
    // Merge next content into current
    updated[selectedIndex] = {
      ...currentChapter,
      content: `${currentChapter.content}\n\n${nextChapter.content}`
    };
    // Remove next
    updated.splice(nextIndex, 1);
    
    setChapters(updated);
  };

  const handleSplitHere = () => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const content = selectedChapter.content;
    
    if (cursor <= 0 || cursor >= content.length) {
        alert("Place your cursor inside the text where you want to split.");
        return;
    }

    const firstPart = content.substring(0, cursor).trim();
    const secondPart = content.substring(cursor).trim();

    const updated = [...chapters];
    
    // Update current
    updated[selectedIndex] = { ...selectedChapter, content: firstPart };
    
    // Insert new
    updated.splice(selectedIndex + 1, 0, {
        title: `New Chapter`,
        content: secondPart
    });

    setChapters(updated);
    setSelectedIndex(selectedIndex + 1); // Jump to the new part
  };

  const handleDelete = () => {
      if (chapters.length <= 1) {
          alert("Cannot delete the only chapter.");
          return;
      }
      if (confirm("Are you sure you want to delete this chapter?")) {
          const updated = [...chapters];
          updated.splice(selectedIndex, 1);
          setChapters(updated);
          setSelectedIndex(prev => Math.min(prev, updated.length - 1));
      }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
        <div>
            <h2 className="text-lg font-serif font-bold text-gray-800">Import Wizard</h2>
            <p className="text-xs text-gray-500">Review and structure your detected chapters before importing.</p>
        </div>
        <div className="flex items-center gap-3">
             <button onClick={onCancel} className="text-sm font-medium text-gray-500 hover:text-gray-800 px-4 py-2">
                 Cancel
             </button>
             <button 
                onClick={() => onConfirm(chapters)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-colors"
             >
                 Finish Import ({chapters.length} Chapters)
             </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto flex flex-col">
            <div className="p-3 text-xs font-bold text-gray-400 uppercase tracking-wider sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                Detected Chapters
            </div>
            <div className="p-2 space-y-1">
                {chapters.map((chap, idx) => (
                    <button
                        key={idx}
                        onClick={() => setSelectedIndex(idx)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors ${
                            idx === selectedIndex 
                                ? 'bg-white shadow-sm text-indigo-700 font-medium ring-1 ring-indigo-200' 
                                : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {idx + 1}. {chap.title}
                    </button>
                ))}
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
             
             {/* Toolbar */}
             <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50 shrink-0">
                 <input 
                    type="text"
                    value={selectedChapter.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="bg-transparent font-serif text-lg font-bold text-gray-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 rounded px-2 py-1 transition-all w-1/2"
                 />
                 
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={handleDelete}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete Chapter"
                     >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                     </button>
                     <div className="w-px h-6 bg-gray-300 mx-2"></div>
                     <button 
                        onClick={handleMergeUp}
                        disabled={selectedIndex === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                     >
                        Merge Up ↑
                     </button>
                     <button 
                        onClick={handleMergeDown}
                        disabled={selectedIndex === chapters.length - 1}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                     >
                        Merge Down ↓
                     </button>
                     <button 
                        onClick={handleSplitHere}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors ml-2"
                     >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                         </svg>
                        Split at Cursor
                     </button>
                 </div>
             </div>

             <div className="flex-1 p-8 overflow-hidden relative">
                 <textarea
                    ref={textareaRef}
                    value={selectedChapter.content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="w-full h-full resize-none outline-none border-none text-lg font-serif text-gray-800 leading-relaxed bg-transparent"
                    placeholder="Chapter content..."
                 />
                 <div className="absolute bottom-4 right-6 text-xs text-gray-400 pointer-events-none">
                     {selectedChapter.content.length} characters
                 </div>
             </div>
        </div>
      </div>
    </div>
  );
};