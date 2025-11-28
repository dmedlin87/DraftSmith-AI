import React from 'react';
import { AnalysisResult } from '../../types';

interface Props {
    characters: AnalysisResult['characters'];
    onQuoteClick: (quote?: string) => void;
}

export const CharactersSection: React.FC<Props> = ({ characters, onQuoteClick }) => {
  return (
    <div>
    <h3 className="text-lg font-serif font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">Character Development</h3>
    <div className="space-y-8">
        {characters.map((char, idx) => (
            <div key={idx} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                {/* Header */}
                <div className="flex justify-between items-center mb-5">
                    <div className="flex items-center gap-3">
                         <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-white border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl shadow-sm">
                             {char.name.charAt(0)}
                         </div>
                         <div>
                             <h4 className="font-bold text-indigo-900 text-xl leading-none mb-1">{char.name}</h4>
                             <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest">Key Character</span>
                         </div>
                    </div>
                </div>
                
                {/* Bio */}
                <div className="mb-6 text-sm text-gray-600 bg-slate-50 p-4 rounded-lg border border-slate-100 leading-relaxed italic border-l-4 border-l-slate-300">
                  "{char.bio}"
                </div>

                {/* Arc Summary */}
                <div className="mb-6">
                     <h5 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                         <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                         Character Arc Summary
                     </h5>
                     <p className="text-sm text-gray-800 leading-relaxed">{char.arc}</p>
                </div>

                {/* Visual Arc Progression Map */}
                {char.arcStages && char.arcStages.length > 0 && (
                    <div className="mb-8">
                        <h5 className="text-xs font-bold text-gray-500 uppercase mb-4">Arc Progression Map</h5>
                        <div className="relative pl-2">
                            {/* Vertical line connecting dots */}
                            <div className="absolute left-[15px] top-2 bottom-4 w-0.5 bg-gray-200"></div>
                            
                            <div className="space-y-6">
                                {char.arcStages.map((stage, sIdx) => (
                                    <div key={sIdx} className="relative flex items-start gap-4">
                                        {/* Dot */}
                                        <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${sIdx === 0 ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : sIdx === char.arcStages.length - 1 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-500'}`}>
                                            <span className="text-xs font-bold">{sIdx + 1}</span>
                                        </div>
                                        {/* Content */}
                                        <div className="flex-1 pt-1">
                                            <h6 className="text-sm font-bold text-gray-900">{stage.stage}</h6>
                                            <p className="text-xs text-gray-600 mt-1 leading-snug">{stage.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Inconsistencies Warning */}
                {char.inconsistencies.length > 0 && (
                    <div className="mt-4 bg-red-50 p-4 rounded-lg border border-red-100">
                        <span className="text-xs font-bold text-red-600 uppercase flex items-center gap-1 mb-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Consistency Alerts
                        </span>
                        <ul className="list-disc list-inside text-xs text-gray-700 space-y-2">
                            {char.inconsistencies.map((inc, i) => (
                                <li key={i} className="group cursor-pointer hover:text-red-800" onClick={() => onQuoteClick(inc.quote)}>
                                    <span>{inc.issue}</span>
                                    {inc.quote && (
                                        <div className="text-[10px] text-gray-500 italic pl-4 mt-1 border-l border-red-200 group-hover:border-red-400">
                                            "{inc.quote}"
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {/* AI Suggestion */}
                <div className="mt-4 text-xs bg-indigo-50 text-indigo-800 p-3 rounded-lg border border-indigo-100 flex gap-2">
                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span><strong>Suggestion: </strong> {char.developmentSuggestion}</span>
                </div>
            </div>
        ))}
    </div>
  </div>
  );
};