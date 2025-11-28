import React from 'react';
import { AnalysisResult } from '../types';
import { ExecutiveSummary } from './analysis/ExecutiveSummary';
import { StrengthsWeaknesses } from './analysis/StrengthsWeaknesses';
import { PacingSection } from './analysis/PacingSection';
import { PlotIssuesSection } from './analysis/PlotIssuesSection';
import { CharactersSection } from './analysis/CharactersSection';
import { SettingConsistencySection } from './analysis/SettingConsistencySection';
import { BrainstormingPanel } from './analysis/BrainstormingPanel';
import { findQuoteRange } from '../utils/textLocator';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isLoading: boolean;
  currentText: string;
  onNavigate: (start: number, end: number) => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, isLoading, currentText, onNavigate }) => {
  
  const handleQuoteClick = (quote?: string) => {
    if (!quote) return;
    const range = findQuoteRange(currentText, quote);
    if (range) {
      onNavigate(range.start, range.end);
    } else {
      alert("Could not locate this exact text in the current chapter.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="animate-pulse font-serif text-lg">Analyzing pacing, detecting plot holes, and profiling characters...</p>
        <p className="text-xs text-gray-400">Using Gemini 3.0 Pro Thinking Mode</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
        <p>Run an analysis to see insights here.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8 prose-content">
      <ExecutiveSummary summary={analysis.summary} />
      <StrengthsWeaknesses strengths={analysis.strengths} weaknesses={analysis.weaknesses} />
      
      {analysis.settingAnalysis && (
        <SettingConsistencySection 
            issues={analysis.settingAnalysis.issues} 
            score={analysis.settingAnalysis.score}
            onQuoteClick={handleQuoteClick}
        />
      )}

      <PacingSection pacing={analysis.pacing} currentText={currentText} />
      
      <PlotIssuesSection 
        issues={analysis.plotIssues} 
        onQuoteClick={handleQuoteClick}
      />
      
      <CharactersSection 
        characters={analysis.characters} 
        onQuoteClick={handleQuoteClick}
      />
      
      <div>
         <h3 className="text-lg font-serif font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">General Suggestions</h3>
         <ul className="space-y-3">
           {analysis.generalSuggestions.map((suggestion, i) => (
             <li key={i} className="text-sm text-gray-700 pl-4 border-l-2 border-indigo-300">
               {suggestion}
             </li>
           ))}
         </ul>
      </div>

      <BrainstormingPanel currentText={currentText} />
    </div>
  );
};