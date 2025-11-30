import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExitIcon } from '@/features/shared/components/Icons';
import { useLayoutStore } from './store/useLayoutStore';

interface ZenModeOverlayProps {
  isZenMode: boolean;
  toggleZenMode: () => void;
}

/**
 * ZenModeOverlay handles the floating exit button and header hover zone
 * that appears when zen mode is active.
 */
export const ZenModeOverlay: React.FC<ZenModeOverlayProps> = ({
  isZenMode,
  toggleZenMode,
}) => {
  const { isExitZenHovered, setExitZenHovered, setHeaderHovered } = useLayoutStore((state) => ({
    isExitZenHovered: state.isExitZenHovered,
    setExitZenHovered: state.setExitZenHovered,
    setHeaderHovered: state.setHeaderHovered,
  }));

  if (!isZenMode) return null;

  return (
    <>
      {/* Invisible hover zone at top for header reveal - with larger touch target */}
      <div
        className="fixed top-0 left-0 right-0 h-12 z-40"
        onMouseEnter={() => setHeaderHovered(true)}
        onFocus={() => setHeaderHovered(true)}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Floating Exit Zen Mode Button */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{
            opacity: isExitZenHovered ? 1 : 0.3,
            scale: isExitZenHovered ? 1 : 0.9,
            y: 0,
          }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-6 right-6 z-50"
          onMouseEnter={() => setExitZenHovered(true)}
          onMouseLeave={() => setExitZenHovered(false)}
        >
          <button
            onClick={toggleZenMode}
            onFocus={() => setExitZenHovered(true)}
            onBlur={() => setExitZenHovered(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-primary)] border border-[var(--border-primary)] shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-[var(--surface-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-accent)] focus:ring-offset-2"
            aria-label="Exit Zen Mode (Escape)"
          >
            <ExitIcon />
            <span className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">
              Exit Zen
            </span>
          </button>
        </motion.div>
      </AnimatePresence>
    </>
  );
};
