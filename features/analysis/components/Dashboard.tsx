import React from 'react';
import { AnalysisResult, AnalysisWarning } from '@/types';
import { AnalysisPanel } from './AnalysisPanel';
import { useEditorActions } from '@/features/core/context/EditorContext';
import { Contradiction, Lore } from '@/types/schema';

interface DashboardProps {
    isLoading: boolean;
    analysis: AnalysisResult | null;
    currentText: string;
    onFixRequest?: (issueContext: string, suggestion: string) => void;
    warning?: AnalysisWarning | null;
    onAnalyzeSelection?: () => void;
    hasSelection?: boolean;
    contradictions?: Contradiction[];
    derivedLore?: Lore | null;
    onNavigateToText?: (start: number, end: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ isLoading, analysis, currentText, onFixRequest, warning, onAnalyzeSelection, hasSelection, contradictions, derivedLore, onNavigateToText }) => {
    const { handleNavigateToIssue } = useEditorActions();
    const navigate = onNavigateToText || handleNavigateToIssue;

    return (
        <AnalysisPanel
            analysis={analysis}
            isLoading={isLoading}
            currentText={currentText}
            onNavigate={navigate}
            onFixRequest={onFixRequest}
            warning={warning}
            onAnalyzeSelection={onAnalyzeSelection}
            hasSelection={hasSelection}
            contradictions={contradictions}
            derivedLore={derivedLore}
        />
    );
};
