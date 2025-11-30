import React from 'react';
import { motion } from 'framer-motion';
import { UsageBadge } from '@/features/shared';
import { useLayoutStore } from './store/useLayoutStore';

interface EditorHeaderProps {
  isZenMode: boolean;
}

/**
 * EditorHeader - The top header bar in the editor view.
 * Auto-hides in Zen Mode but reveals on hover.
 */
export const EditorHeader: React.FC<EditorHeaderProps> = ({ isZenMode }) => {
  const { isHeaderHovered, setHeaderHovered } = useLayoutStore((state) => ({
    isHeaderHovered: state.isHeaderHovered,
    setHeaderHovered: state.setHeaderHovered,
  }));

  const shouldHide = isZenMode && !isHeaderHovered;

  return (
    <motion.header
      initial={false}
      animate={{
        y: shouldHide ? -60 : 0,
        opacity: shouldHide ? 0 : 1,
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
      onMouseEnter={() => isZenMode && setHeaderHovered(true)}
      onMouseLeave={() => setHeaderHovered(false)}
      role="banner"
    >
      <div className="flex items-center gap-4">
        <UsageBadge />
      </div>
    </motion.header>
  );
};
