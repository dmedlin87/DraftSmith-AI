import React, { useState } from 'react';
import { EditorLayout } from '@/features/layout/EditorLayout';
import { SidebarTab } from '@/types';

interface WorkspaceProps {
  onHomeClick: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ onHomeClick }) => {
  // View State only; all editor/project/engine data now come from contexts in EditorLayout
  const [activeTab, setActiveTab] = useState<SidebarTab>(SidebarTab.ANALYSIS);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isToolsCollapsed, setIsToolsCollapsed] = useState(false);

  const handleTabChange = (tab: SidebarTab) => {
    setActiveTab(tab);
    setIsToolsCollapsed(false);
  };

  return (
    <EditorLayout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      isToolsCollapsed={isToolsCollapsed}
      onToggleTools={() => setIsToolsCollapsed(!isToolsCollapsed)}
      onHomeClick={onHomeClick}
    />
  );
};