import React, { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useProjectStore } from '../store/useProjectStore';
import { Chapter } from '@/types/schema';

// Animation variants for cards
const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    },
  }),
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
};

/**
 * Generate pacing heat map color based on score
 * Low score (slow) = warmer/red, High score (fast) = cooler/green
 */
function getPacingGradient(score: number | undefined): string {
  if (score === undefined) return 'bg-gray-200';
  
  // Score 1-10: 1 = very slow (red), 5 = medium (yellow), 10 = very fast (green)
  if (score <= 3) return 'bg-gradient-to-r from-red-500 to-red-400';
  if (score <= 5) return 'bg-gradient-to-r from-orange-500 to-amber-400';
  if (score <= 7) return 'bg-gradient-to-r from-yellow-400 to-lime-400';
  return 'bg-gradient-to-r from-green-400 to-emerald-500';
}

function getPacingLabel(score: number | undefined): string {
  if (score === undefined) return 'Not analyzed';
  if (score <= 3) return 'Slow';
  if (score <= 5) return 'Moderate';
  if (score <= 7) return 'Good';
  return 'Fast';
}

interface SceneCardProps {
  chapter: Chapter;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  chapter,
  index,
  isActive,
  isDragging,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const summary = chapter.lastAnalysis?.summary || 'No analysis yet. Run Deep Analysis to see insights.';
  const pacingScore = chapter.lastAnalysis?.pacing?.score;
  const wordCount = chapter.content.split(/\s+/).filter(Boolean).length;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
    >
      <motion.div
        layout
        layoutId={chapter.id}
        onClick={onSelect}
        whileHover={{ scale: 1.02, y: -4, rotate: isActive ? 0 : 0.5 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`
          group relative cursor-pointer overflow-hidden
          ${isDragging ? 'opacity-50' : 'opacity-100'}
        `}
        style={{
          // Index card styling
          background: 'linear-gradient(135deg, #fffef5 0%, #fff9e6 100%)',
          borderRadius: '2px',
          boxShadow: isActive 
            ? '0 8px 25px -5px rgba(99, 102, 241, 0.4), 0 0 0 2px rgb(99, 102, 241)'
            : '0 4px 12px -2px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
      {/* Pacing Heat Map Bar at Top */}
      <div className="relative h-2">
        <div 
          className={`absolute inset-0 ${getPacingGradient(pacingScore)}`}
          style={{ opacity: pacingScore !== undefined ? 1 : 0.3 }}
        />
        {/* Score indicator position */}
        {pacingScore !== undefined && (
          <div 
            className="absolute top-0 bottom-0 w-1 bg-white shadow-sm"
            style={{ left: `${(pacingScore / 10) * 100}%`, transform: 'translateX(-50%)' }}
          />
        )}
      </div>

      {/* Ruled lines background (index card effect) */}
      <div 
        className="absolute inset-0 top-2 pointer-events-none opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, #4a90a4 23px, #4a90a4 24px)',
          backgroundPosition: '0 8px',
        }}
      />

      {/* Red margin line */}
      <div className="absolute left-8 top-2 bottom-0 w-px bg-red-300/40" />

      {/* Card Header */}
      <div className="px-4 pt-3 pb-2 pl-10">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono
              ${isActive ? 'bg-indigo-500 text-white' : 'bg-amber-100 text-amber-700 border border-amber-200'}
            `}>
              {index + 1}
            </span>
            <h3 className="font-serif font-semibold text-gray-800 line-clamp-1 text-base">
              {chapter.title}
            </h3>
          </div>
        </div>
        {/* Pacing label */}
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] uppercase tracking-wide font-semibold ${
            pacingScore === undefined ? 'text-gray-400' :
            pacingScore <= 3 ? 'text-red-500' :
            pacingScore <= 5 ? 'text-amber-500' :
            pacingScore <= 7 ? 'text-lime-600' : 'text-emerald-500'
          }`}>
            {getPacingLabel(pacingScore)}
          </span>
          {pacingScore !== undefined && (
            <span className="text-[10px] text-gray-400">({pacingScore}/10)</span>
          )}
        </div>
      </div>

      {/* Card Body - Beat Sheet Style */}
      <div className="px-4 py-2 pl-10">
        <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed" style={{ fontFamily: 'system-ui, sans-serif' }}>
          {summary}
        </p>
      </div>

      {/* Card Footer */}
      <div className="px-4 pb-3 pl-10 flex items-center justify-between">
        <span className="text-xs text-gray-400 font-mono">
          {wordCount.toLocaleString()} w
        </span>
        <div className="flex items-center gap-0.5">
          {chapter.lastAnalysis?.characters?.slice(0, 4).map((char, i) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold border border-indigo-200/50 -ml-1.5 first:ml-0"
              title={char.name}
            >
              {char.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* Corner fold effect */}
      <div 
        className="absolute top-0 right-0 w-4 h-4"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, #e8e4d9 50%)',
        }}
      />

      {/* Drag Handle - appears on hover */}
      <div className="absolute top-3 right-5 opacity-0 group-hover:opacity-60 transition-opacity">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400">
          <circle cx="6" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="18" r="2"/>
          <circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/>
        </svg>
      </div>

      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
      )}
      </motion.div>
    </div>
  );
};

interface StoryBoardProps {
  onSwitchToEditor: () => void;
}

export const StoryBoard: React.FC<StoryBoardProps> = ({ onSwitchToEditor }) => {
  const { 
    chapters, 
    activeChapterId, 
    selectChapter, 
    createChapter, 
    reorderChapters,
    currentProject 
  } = useProjectStore();

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const newChapters = [...chapters];
    const [draggedItem] = newChapters.splice(draggedIndex, 1);
    newChapters.splice(dropIndex, 0, draggedItem);

    reorderChapters(newChapters);
    setDraggedIndex(null);
  };

  const handleQuickCreate = async () => {
    if (isCreating && newChapterTitle.trim()) {
      await createChapter(newChapterTitle.trim());
      setNewChapterTitle('');
      setIsCreating(false);
    } else {
      setIsCreating(true);
    }
  };

  const handleSelectAndEdit = (chapterId: string) => {
    selectChapter(chapterId);
    onSwitchToEditor();
  };

  const totalWords = chapters.reduce((sum, ch) => sum + ch.content.split(/\s+/).filter(Boolean).length, 0);
  const analyzedCount = chapters.filter(ch => ch.lastAnalysis).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(135deg, #3d3024 0%, #2a231a 100%)' }}>
      {/* Header */}
      <header className="bg-gradient-to-r from-amber-900/90 to-amber-800/90 border-b border-amber-950/50 px-6 py-4 shrink-0 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-amber-50 flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-300">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              Beat Board
            </h1>
            <p className="text-sm text-amber-200/70 mt-1">
              {currentProject?.title} — {chapters.length} chapters, {totalWords.toLocaleString()} words
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-amber-300/60 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              {analyzedCount}/{chapters.length} analyzed
            </div>
            <button
              onClick={onSwitchToEditor}
              className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-medium text-amber-900 hover:bg-white transition-colors flex items-center gap-2 shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editor View
            </button>
          </div>
        </div>
      </header>

      {/* Board Grid - Cork board texture */}
      <div 
        className="flex-1 overflow-auto p-6"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundBlendMode: 'soft-light',
        }}
      >
        <LayoutGroup>
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 auto-rows-min"
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {chapters.map((chapter, index) => (
                <motion.div
                  key={chapter.id}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                >
                  <SceneCard
                    chapter={chapter}
                    index={index}
                    isActive={chapter.id === activeChapterId}
                    isDragging={draggedIndex === index}
                    onSelect={() => handleSelectAndEdit(chapter.id)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Quick Create Card - Blank index card style */}
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: chapters.length * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
              className="overflow-hidden"
              style={{
                background: isCreating 
                  ? 'linear-gradient(135deg, #fffef5 0%, #fff9e6 100%)'
                  : 'linear-gradient(135deg, rgba(255,254,245,0.6) 0%, rgba(255,249,230,0.6) 100%)',
                borderRadius: '2px',
                boxShadow: isCreating
                  ? '0 4px 12px -2px rgba(0,0,0,0.15), 0 0 0 2px rgb(99, 102, 241)'
                  : '0 2px 8px -2px rgba(0,0,0,0.1)',
                border: isCreating ? 'none' : '2px dashed rgba(139, 119, 101, 0.4)',
              }}
            >
              <AnimatePresence mode="wait">
                {isCreating ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 space-y-3"
                  >
                    {/* Ruled lines effect */}
                    <div 
                      className="absolute inset-0 pointer-events-none opacity-[0.06]"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, #4a90a4 23px, #4a90a4 24px)',
                        backgroundPosition: '0 8px',
                      }}
                    />
                    <input
                      type="text"
                      value={newChapterTitle}
                      onChange={(e) => setNewChapterTitle(e.target.value)}
                      placeholder="Chapter title..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickCreate();
                        if (e.key === 'Escape') setIsCreating(false);
                      }}
                      className="w-full px-3 py-2 bg-white/80 border border-amber-200 rounded text-sm font-serif focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-800 placeholder-gray-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleQuickCreate}
                        className="flex-1 py-2 bg-indigo-500 text-white rounded text-sm font-medium hover:bg-indigo-600 transition-colors"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setIsCreating(false);
                          setNewChapterTitle('');
                        }}
                        className="px-4 py-2 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsCreating(true)}
                    className="w-full h-full min-h-[180px] flex flex-col items-center justify-center gap-2 text-amber-700/60 hover:text-amber-800 transition-colors p-4"
                  >
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </div>
                    <span className="font-medium text-sm">New Card</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </LayoutGroup>
      </div>
    </div>
  );
};
