import React, { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';

interface Props {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export const ProjectSidebar: React.FC<Props> = ({ collapsed, toggleCollapsed }) => {
  const { 
    chapters, 
    activeChapterId, 
    selectChapter, 
    createChapter, 
    reorderChapters,
    currentProject
  } = useProjectStore();

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Set a transparent ghost image if needed, or default is fine
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newChapters = [...chapters];
    const [draggedItem] = newChapters.splice(draggedIndex, 1);
    newChapters.splice(dropIndex, 0, draggedItem);
    
    reorderChapters(newChapters);
    setDraggedIndex(null);
  };

  const handleCreate = async () => {
    await createChapter();
  };

  if (collapsed) {
    return (
      <div className="w-12 border-r border-gray-200 bg-gray-50 flex flex-col items-center py-4 space-y-4">
        <button 
          onClick={toggleCollapsed}
          className="p-2 rounded-lg hover:bg-gray-200 text-gray-500"
          title="Expand Chapter List"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div className="flex-1 w-full flex flex-col items-center gap-2">
           {chapters.map(c => (
              <div 
                key={c.id} 
                className={`w-2 h-2 rounded-full ${c.id === activeChapterId ? 'bg-indigo-600' : 'bg-gray-300'}`}
                title={c.title}
                onClick={() => selectChapter(c.id)}
              />
           ))}
        </div>
        <button onClick={handleCreate} className="text-indigo-600 hover:text-indigo-800" title="New Chapter">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full shadow-inner">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white/50 backdrop-blur-sm">
        <div>
           <h3 className="font-serif font-bold text-gray-800 text-sm truncate max-w-[140px]" title={currentProject?.title}>
             {currentProject?.title || 'Untitled'}
           </h3>
           <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Manuscript</p>
        </div>
        <button 
          onClick={toggleCollapsed}
          className="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        >
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
             <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
           </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
         {chapters.map((chapter, index) => (
           <div
             key={chapter.id}
             draggable
             onDragStart={(e) => handleDragStart(e, index)}
             onDragOver={(e) => handleDragOver(e, index)}
             onDrop={(e) => handleDrop(e, index)}
             onClick={() => selectChapter(chapter.id)}
             className={`
               group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all border
               ${chapter.id === activeChapterId 
                  ? 'bg-white border-indigo-200 shadow-sm text-indigo-900 font-medium' 
                  : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600 hover:shadow-sm'
               }
               ${draggedIndex === index ? 'opacity-50 dashed border-2 border-indigo-300' : ''}
             `}
           >
             <span className="text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-500">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
               </svg>
             </span>
             
             <span className="flex-1 truncate select-none">{chapter.title}</span>
             
             {chapter.lastAnalysis && (
                <div 
                  className={`w-2 h-2 rounded-full ${
                    chapter.lastAnalysis.pacing.score >= 7 ? 'bg-green-400' : 'bg-orange-400'
                  }`} 
                  title={`Analysis Score: ${chapter.lastAnalysis.pacing.score}`}
                />
             )}
           </div>
         ))}
      </div>

      {/* Footer / Add Button */}
      <div className="p-3 border-t border-gray-200 bg-gray-100/50">
         <button 
           onClick={handleCreate}
           className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg shadow-sm text-gray-700 text-sm font-medium hover:border-indigo-400 hover:text-indigo-600 hover:shadow-md transition-all flex items-center justify-center gap-2"
         >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
               <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Chapter
         </button>
      </div>
    </div>
  );
};