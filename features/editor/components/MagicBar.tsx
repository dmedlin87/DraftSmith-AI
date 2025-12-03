import React, { useState, useEffect, useMemo } from 'react';
import { useViewportCollision } from '@/features/shared';
import { GrammarSuggestion } from '@/types';

interface MagicBarProps {
  isLoading: boolean;
  variations: string[];
  helpResult?: string;
  helpType?: 'Explain' | 'Thesaurus' | null;
  activeMode?: string | null;
  grammarSuggestions: GrammarSuggestion[];
  onRewrite: (mode: string, tone?: string) => void;
  onHelp: (type: 'Explain' | 'Thesaurus') => void;
  onApply: (text: string) => void;
  onGrammarCheck: () => void;
  onApplyGrammar: (id?: string | null) => void;
  onApplyAllGrammar: () => void;
  onDismissGrammar: (id: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

// --- Icons ---
const Icons = {
  Sparkles: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z" /></svg>,
  Book: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  Lightbulb: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5a6 6 0 0 0-12 0c0 1.5.5 2.5 1.5 3.5.8.8 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>,
  Eye: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>,
  Message: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>,
  Palette: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.6 1.6 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  Copy: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>,
  ChevronLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
};

// --- Sparkle Animation Component ---
const Sparkle = ({ delay, style }: { delay: number; style?: React.CSSProperties }) => (
  <div 
    className="absolute pointer-events-none"
    style={{
      ...style,
      animation: `sparkle 2s ease-in-out infinite`,
      animationDelay: `${delay}ms`
    }}
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--magic-300)" className="text-[var(--magic-300)]">
      <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
    </svg>
  </div>
);

const SparkleField = () => {
  const sparkles = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      scale: 0.5 + Math.random() * 0.5,
      delay: Math.random() * 1000
    }));
  }, []);
  
  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
      {sparkles.map(s => (
        <Sparkle 
          key={s.id} 
          delay={s.delay} 
          style={{ 
            top: s.top, 
            left: s.left, 
            transform: `scale(${s.scale})` 
          }} 
        />
      ))}
    </div>
  );
};

// --- Main Component ---
const MagicBarComponent: React.FC<MagicBarProps> = ({
  isLoading,
  variations,
  helpResult,
  helpType,
  activeMode,
  grammarSuggestions,
  onRewrite,
  onHelp,
  onApply,
  onGrammarCheck,
  onApplyGrammar,
  onApplyAllGrammar,
  onDismissGrammar,
  onClose,
  position
}) => {
  const [activeView, setActiveView] = useState<'menu' | 'tone' | 'variations' | 'help' | 'grammar'>('menu');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Determine element dimensions based on current view for collision detection
  const elementDimensions = useMemo(() => {
    if (activeView === 'variations' || activeView === 'help' || activeView === 'grammar') {
      return { elementWidth: 480, elementHeight: 400 };
    }
    // Menu/tone view is smaller
    return { elementWidth: 500, elementHeight: 60 };
  }, [activeView]);

  // Use viewport-aware positioning
  const safePosition = useViewportCollision(position, {
    padding: 16,
    preferVertical: 'above',
    ...elementDimensions,
  });

  // Use safe position if available, fallback to original
  const displayPosition = safePosition || position;

  // Auto-switch views based on incoming props
  useEffect(() => {
    if (isLoading) return; // Stay on whatever view if loading, typically loading view renders separately
    
    if (grammarSuggestions.length > 0) setActiveView('grammar');
    else if (variations.length > 0) setActiveView('variations');
    else if (helpResult) setActiveView('help');
    else if (activeView !== 'tone') setActiveView('menu');
  }, [variations, helpResult, isLoading, grammarSuggestions.length, activeView]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const menuButtonClass = "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-[var(--interactive-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95";
  const primaryButtonClass = "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)] hover:bg-[var(--interactive-bg-hover)] hover:text-[var(--interactive-accent-hover)] shadow-sm hover:shadow-md border border-[var(--glass-border)]";

  // --- Render Loading State ---
  if (isLoading) {
    return (
      <div 
        style={{ top: displayPosition.top, left: displayPosition.left }}
        className="fixed z-50 -translate-x-1/2 -translate-y-full -mt-4 animate-scale-in origin-bottom"
      >
        <div className="relative glass-strong text-[var(--text-primary)] rounded-full px-6 py-3 shadow-[var(--shadow-magic)] flex items-center gap-3">
          <SparkleField />
          <div className="relative z-10 flex items-center gap-3">
             <div className="w-5 h-5 border-2 border-[var(--interactive-accent)] border-t-transparent rounded-full animate-spin"></div>
             <span className="text-sm font-medium bg-gradient-to-r from-[var(--magic-300)] to-[var(--interactive-accent)] bg-clip-text text-transparent animate-pulse">
               Consulting the muse...
             </span>
             {activeMode && (
               <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--interactive-bg-active)] border border-[var(--glass-border)] text-[10px] font-bold text-[var(--interactive-accent)] uppercase tracking-wider animate-fade-in">
                 {activeMode}
               </span>
             )}
          </div>
          {/* Triangle Caret */}
          <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-[var(--glass-bg)] rotate-45 border-b border-r border-[var(--glass-border)]"></div>
        </div>
      </div>
    );
  }

  // --- Render Content ---
  return (
    <div 
      style={{ top: displayPosition.top, left: displayPosition.left }}
      className={`fixed z-50 -translate-x-1/2 -mt-4 animate-scale-in ${
        safePosition?.adjustments.vertical === 'down' 
          ? 'origin-top' 
          : '-translate-y-full origin-bottom'
      }`}
    >
      {/* 1. Main Menu & Tone Selector - Glassmorphism */}
      {(activeView === 'menu' || activeView === 'tone') && (
        <div className="glass-strong rounded-xl shadow-2xl p-2 flex items-center gap-1.5 relative animate-fade-in">
          
          {activeView === 'menu' ? (
            <>
              {/* Context Tools */}
              <div className="flex gap-1">
                  <button onClick={() => onHelp('Explain')} className={menuButtonClass} title="Explain Selection">
                    <Icons.Lightbulb /> <span className="hidden sm:inline">Explain</span>
                  </button>
                  <button onClick={() => onHelp('Thesaurus')} className={menuButtonClass} title="Find Synonyms">
                    <Icons.Book /> <span className="hidden sm:inline">Synonyms</span>
                  </button>
                  <button onClick={onGrammarCheck} className={menuButtonClass} title="Flag grammar issues">
                    <Icons.Check /> <span className="hidden sm:inline">Fix grammar</span>
                  </button>
              </div>

              <div className="w-px h-6 bg-[var(--border-primary)] mx-1"></div>

              {/* Rewrite Tools */}
              <div className="flex gap-1">
                  <button onClick={() => onRewrite("Show, Don't Tell")} className={primaryButtonClass} title="Make descriptive">
                    <Icons.Eye /> Show
                  </button>
                  <button onClick={() => onRewrite('Dialogue Doctor')} className={primaryButtonClass} title="Improve dialogue">
                    <Icons.Message /> Dialogue
                  </button>
                  <button onClick={() => setActiveView('tone')} className={primaryButtonClass} title="Change Tone">
                    <Icons.Palette /> Tone
                  </button>
              </div>

              <div className="w-px h-6 bg-[var(--border-primary)] mx-1"></div>

              {/* Close */}
              <button onClick={onClose} className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--interactive-bg-hover)] transition-colors">
                <Icons.X />
              </button>
            </>
          ) : (
            /* Tone View */
            <div className="flex items-center gap-1 animate-slide-up">
              <button 
                onClick={() => setActiveView('menu')} 
                className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--interactive-bg-hover)] mr-1"
              >
                <Icons.ChevronLeft />
              </button>
              {['Darker', 'Lighter', 'Formal', 'Emotional', 'Period'].map((tone, i) => (
                 <button
                   key={tone}
                   onClick={() => onRewrite('Tone Tuner', tone)}
                   className={menuButtonClass}
                   style={{ animationDelay: `${i * 50}ms` }}
                 >
                   {tone}
                 </button>
              ))}
            </div>
          )}
          
          {/* Caret */}
          <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-[var(--glass-bg)] rotate-45 border-b border-r border-[var(--glass-border)]"></div>
        </div>
      )}

      {/* 2. Variations & Help - Glassmorphism */}
      {(activeView === 'variations' || activeView === 'help' || activeView === 'grammar') && (
        <div className="glass-strong rounded-xl shadow-xl w-[480px] max-w-[90vw] overflow-hidden flex flex-col animate-slide-up origin-bottom">

          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--glass-border)] flex justify-between items-center">
            <div className="flex items-center gap-2 text-[var(--text-primary)] font-serif font-bold text-base">
              {activeView === 'variations' ? (
                <>
                  <span className="text-[var(--interactive-accent)]"><Icons.Sparkles /></span>
                  <div className="flex flex-col leading-tight">
                    <span className="font-bold">Magic Variations</span>
                    {activeMode && (
                      <span className="inline-flex self-start mt-0.5 px-1.5 py-0.5 rounded bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)] text-[10px] font-bold uppercase tracking-wider border border-[var(--glass-border)]">
                        {activeMode}
                      </span>
                    )}
                  </div>
                </>
              ) : activeView === 'grammar' ? (
                <>
                  <span className="text-[var(--interactive-accent)]"><Icons.Check /></span>
                  <div className="flex flex-col leading-tight">
                    <span className="font-bold">Grammar & Style</span>
                    <span className="text-[12px] text-[var(--text-tertiary)]">Apply quick fixes to your selection</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-[var(--interactive-accent)]"><Icons.Lightbulb /></span>
                  {helpType === 'Thesaurus' ? 'Synonyms & Related Words' : 'Context & Definition'}
                </>
              )}
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg-hover)] hover:text-[var(--text-primary)] rounded-md transition-colors"
            >
              <Icons.X />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 max-h-[320px] overflow-y-auto custom-scrollbar">
            {activeView === 'variations' ? (
              <div className="space-y-3">
                {variations.map((v, i) => (
                  <div
                    key={i}
                    onClick={() => onApply(v)}
                    className="group relative p-5 bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-primary)] hover:border-[var(--interactive-accent)] hover:shadow-md cursor-pointer transition-all duration-300 transform hover:-translate-y-0.5 animate-slide-up hover:ring-1 hover:ring-[var(--interactive-bg-active)]"
                    style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
                  >
                    <p className="text-[var(--text-primary)] font-serif text-lg leading-relaxed pr-6">{v}</p>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(v, i); }}
                        className={`p-1.5 rounded-md border transition-all ${copiedIndex === i ? 'bg-[var(--success-100)] border-[var(--success-500)] text-[var(--success-500)]' : 'bg-[var(--surface-elevated)] border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'}`}
                        title="Copy to clipboard"
                      >
                        {copiedIndex === i ? <Icons.Check /> : <Icons.Copy />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeView === 'grammar' ? (
              <div className="space-y-3 animate-fade-in">
                {grammarSuggestions.length === 0 ? (
                  <p className="text-[var(--text-secondary)] text-sm">No grammar issues detected in this selection.</p>
                ) : (
                  <>
                    {grammarSuggestions.map((suggestion, index) => (
                      <div
                        key={suggestion.id}
                        className="p-4 bg-[var(--surface-elevated)] border border-[var(--border-primary)] rounded-lg shadow-sm animate-slide-up"
                        style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">{suggestion.message}</p>
                            <p className="text-[var(--text-secondary)] text-sm">
                              <span className="line-through decoration-error-500 mr-1">{suggestion.originalText}</span>
                              <span className="text-[var(--success-600)]">→ {suggestion.replacement}</span>
                            </p>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)] font-bold uppercase tracking-wide">
                            {suggestion.severity === 'style' ? 'Style' : 'Grammar'}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3 flex-wrap">
                          <button
                            onClick={() => onApplyGrammar(suggestion.id)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--interactive-accent)] text-[var(--text-inverse)] text-sm font-medium hover:bg-[var(--interactive-accent-strong)] transition-colors"
                          >
                            Apply fix
                          </button>
                          <button
                            onClick={() => onDismissGrammar(suggestion.id)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm hover:bg-[var(--interactive-bg-hover)]"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                    {grammarSuggestions.length > 1 && (
                      <button
                        onClick={onApplyAllGrammar}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--ink-900)] text-[var(--parchment-50)] text-sm font-semibold hover:bg-[var(--ink-800)] transition-colors"
                      >
                        Apply all fixes
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="animate-fade-in">
                {helpType === 'Thesaurus' && helpResult ? (
                   <div className="flex flex-wrap gap-2">
                     {helpResult.split(',').map((word, i) => (
                       <button
                         key={i}
                         onClick={() => onApply(word.trim())}
                         className="px-4 py-2 bg-[var(--surface-elevated)] border border-[var(--border-primary)] rounded-lg text-[var(--text-secondary)] text-sm font-medium hover:border-[var(--interactive-accent)] hover:bg-[var(--interactive-bg-active)] hover:text-[var(--interactive-accent)] transition-all shadow-sm active:scale-95 animate-scale-in"
                         style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
                       >
                         {word.trim()}
                       </button>
                     ))}
                   </div>
                ) : (
                   <div className="bg-[var(--surface-elevated)] p-4 rounded-lg border border-[var(--border-primary)] shadow-sm">
                      <p className="text-[var(--text-primary)] font-serif text-lg leading-relaxed">{helpResult}</p>
                   </div>
                )}
              </div>
            )}
          </div>
          
          {/* Caret */}
          <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-[var(--glass-bg)] rotate-45 border-b border-r border-[var(--glass-border)]"></div>
        </div>
      )}
    </div>
  );
};

export const MagicBar = React.memo(MagicBarComponent);