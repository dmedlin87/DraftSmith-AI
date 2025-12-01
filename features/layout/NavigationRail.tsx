import React from 'react';
import { motion } from 'framer-motion';
import { SidebarTab, MainView, type CharacterProfile } from '@/types';
import { DEFAULT_PERSONAS } from '@/types/personas';
import { AIPresenceOrb, type OrbStatus } from '@/features/agent';
import { useLayoutStore } from './store/useLayoutStore';
import {
  ZenIcon,
  AnalysisIcon,
  HistoryIcon,
  MicIcon,
  WandIcon,
  GraphIcon,
  BookIcon,
  BoardIcon,
  SunIcon,
  MoonIcon,
} from '@/features/shared/components/Icons';

interface NavigationRailProps {
  isZenMode: boolean;
  toggleZenMode: () => void;
  orbStatus: OrbStatus;
  analysisReady: boolean;
}

const NAV_ITEMS: Array<{ tab: SidebarTab; Icon: React.FC<{ className?: string }>; label: string }> = [
  { tab: SidebarTab.ANALYSIS, Icon: AnalysisIcon, label: 'Analysis' },
  { tab: SidebarTab.HISTORY, Icon: HistoryIcon, label: 'History' },
  { tab: SidebarTab.VOICE, Icon: MicIcon, label: 'Voice' },
  { tab: SidebarTab.GRAPH, Icon: GraphIcon, label: 'Graph' },
  { tab: SidebarTab.LORE, Icon: BookIcon, label: 'Lore Bible' },
];

export const NavigationRail: React.FC<NavigationRailProps> = ({
  isZenMode,
  toggleZenMode,
  orbStatus,
  analysisReady,
}) => {
  const {
    activeTab,
    activeView,
    theme,
    currentPersonaIndex,
    openTabWithPanel,
    toggleView,
    toggleTheme,
  } = useLayoutStore((state) => ({
    activeTab: state.activeTab,
    activeView: state.activeView,
    theme: state.theme,
    currentPersonaIndex: state.currentPersonaIndex,
    openTabWithPanel: state.openTabWithPanel,
    toggleView: state.toggleView,
    toggleTheme: state.toggleTheme,
  }));

  const currentPersona = DEFAULT_PERSONAS[currentPersonaIndex];

  const handleHomeClick = () => {
    window.location.reload();
  };

  return (
    <motion.nav
      animate={{
        x: isZenMode ? -80 : 0,
        opacity: isZenMode ? 0 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-16 bg-[var(--nav-bg)] border-r border-[var(--border-primary)] flex flex-col items-center py-6 gap-2 shrink-0 z-40"
      style={{ pointerEvents: isZenMode ? 'none' : 'auto' }}
      aria-label="Main navigation"
      aria-hidden={isZenMode}
      // @ts-ignore - inert is a valid attribute but may not be in React types yet
      inert={isZenMode ? "true" : undefined}
    >
      {/* Home/Library Button */}
      <button
        onClick={handleHomeClick}
        className="w-10 h-10 rounded-xl bg-[var(--interactive-accent)] text-[var(--text-inverse)] flex items-center justify-center shadow-md mb-4 hover:scale-105 transition-transform"
        aria-label="Return to Library"
      >
        <WandIcon />
      </button>

      {/* View Toggle */}
      <button
        onClick={toggleView}
        aria-label={activeView === MainView.EDITOR ? 'Switch to Story Board' : 'Switch to Editor'}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all mb-2 ${
          activeView === MainView.STORYBOARD
            ? 'bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)]'
            : 'text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--text-secondary)]'
        }`}
      >
        <BoardIcon />
      </button>

      <div className="w-8 border-t border-[var(--border-primary)] mb-2" aria-hidden="true" />

      {/* AI Presence Orb */}
      <AIPresenceOrb
        status={orbStatus}
        persona={currentPersona}
        analysisReady={analysisReady}
        onClick={() => openTabWithPanel(SidebarTab.CHAT)}
        isActive={activeTab === SidebarTab.CHAT}
      />

      {/* Navigation Items */}
      {NAV_ITEMS.map(({ tab, Icon, label }) => (
        <button
          key={tab}
          onClick={() => openTabWithPanel(tab)}
          aria-label={label}
          aria-current={activeTab === tab ? 'page' : undefined}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all relative ${
            activeTab === tab
              ? 'bg-[var(--interactive-bg-active)] text-[var(--interactive-accent)]'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Icon />
          {activeTab === tab && (
            <div
              className="absolute right-[-13px] top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--interactive-accent)] rounded-l-sm"
              aria-hidden="true"
            />
          )}
        </button>
      ))}

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          onClick={toggleZenMode}
          aria-label="Enter Zen Mode"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--interactive-accent)] transition-all"
        >
          <ZenIcon />
        </button>

        <button
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--interactive-bg)] hover:text-[var(--interactive-accent)] transition-all"
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </motion.nav>
  );
};
