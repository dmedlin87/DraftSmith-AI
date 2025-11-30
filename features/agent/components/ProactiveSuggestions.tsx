/**
 * Proactive Suggestions Component
 * 
 * Displays memory-based suggestions when navigating to chapters
 * with watched entities, related memories, or active goals.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProactiveSuggestion } from '@/services/memory/proactive';

interface ProactiveSuggestionsProps {
  suggestions: ProactiveSuggestion[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onAction?: (suggestion: ProactiveSuggestion) => void;
}

const suggestionVariants = {
  hidden: { opacity: 0, x: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 }
  },
  exit: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.15 } }
};

const typeIcons: Record<ProactiveSuggestion['type'], string> = {
  watched_entity: '👁️',
  related_memory: '💭',
  active_goal: '🎯',
  reminder: '⚡',
};

const priorityColors: Record<ProactiveSuggestion['priority'], string> = {
  high: 'border-red-200 bg-red-50',
  medium: 'border-amber-200 bg-amber-50',
  low: 'border-blue-200 bg-blue-50',
};

const priorityDots: Record<ProactiveSuggestion['priority'], string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-500',
};

export const ProactiveSuggestions: React.FC<ProactiveSuggestionsProps> = ({
  suggestions,
  onDismiss,
  onDismissAll,
  onAction,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-indigo-600">✨</span>
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Suggestions
          </span>
          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
            {suggestions.length}
          </span>
        </div>
        <button
          onClick={onDismissAll}
          className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          Dismiss all
        </button>
      </div>

      {/* Suggestions List */}
      <AnimatePresence mode="popLayout">
        {suggestions.map((suggestion) => (
          <motion.div
            key={suggestion.id}
            variants={suggestionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            className={`relative p-3 rounded-lg border ${priorityColors[suggestion.priority]} shadow-sm`}
          >
            {/* Priority Indicator */}
            <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${priorityDots[suggestion.priority]}`} />
            
            {/* Content */}
            <div className="pr-6">
              {/* Type Icon & Title */}
              <div className="flex items-start gap-2 mb-1">
                <span className="text-sm">{typeIcons[suggestion.type]}</span>
                <span className="text-sm font-medium text-gray-800 leading-tight">
                  {suggestion.title}
                </span>
              </div>
              
              {/* Description */}
              <p className="text-xs text-gray-600 ml-6 leading-relaxed">
                {suggestion.description}
              </p>
              
              {/* Tags */}
              {suggestion.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 ml-6">
                  {suggestion.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] bg-white/60 text-gray-500 px-1.5 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              
              {/* Actions */}
              <div className="flex items-center gap-3 mt-2 ml-6">
                {onAction && suggestion.suggestedAction && (
                  <button
                    onClick={() => onAction(suggestion)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    Take action →
                  </button>
                )}
                <button
                  onClick={() => onDismiss(suggestion.id)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/**
 * Compact version for embedding in other panels
 */
export const ProactiveSuggestionsBadge: React.FC<{
  count: number;
  onClick: () => void;
}> = ({ count, onClick }) => {
  if (count === 0) return null;

  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium hover:bg-indigo-200 transition-colors"
    >
      <span>✨</span>
      <span>{count} suggestion{count !== 1 ? 's' : ''}</span>
    </motion.button>
  );
};

export default ProactiveSuggestions;
