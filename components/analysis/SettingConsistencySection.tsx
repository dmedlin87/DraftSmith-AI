import React from 'react';

interface Props {
    issues: Array<{
        quote: string;
        issue: string;
        suggestion: string;
        alternatives?: string[];
    }>;
    onQuoteClick: (quote?: string) => void;
    score: number;
}

export const SettingConsistencySection: React.FC<Props> = ({ issues, onQuoteClick, score }) => {
  return (
    <div>
    <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
        <h3 className="text-lg font-serif font-bold text-gray-800">Setting & Era Consistency</h3>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${score >= 8 ? 'bg-green-100 text-green-700' : score >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            Accuracy: {score}/10
        </span>
    </div>
    
    {issues.length === 0 ? (
        <div className="p-4 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-100 italic">
            No anachronisms or tone mismatches detected for this era.
        </div>
    ) : (
        <div className="space-y-4">
            {issues.map((item, idx) => (
                <div 
                  key={idx} 
                  className="bg-white p-4 rounded-lg border border-purple-100 shadow-sm relative overflow-hidden group hover:border-purple-300 transition-colors"
                >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-400 group-hover:bg-purple-500 transition-colors"></div>
                    
                    {/* The Issue Header */}
                    <div className="flex justify-between items-start mb-2">
                         <h4 className="font-semibold text-gray-900 text-sm">{item.issue}</h4>
                         <button 
                             onClick={() => onQuoteClick(item.quote)}
                             className="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-600 transition-colors flex items-center gap-1"
                         >
                             <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                             Find in text
                         </button>
                    </div>

                    {/* Quote */}
                    <div className="mb-3 text-xs italic text-gray-500 border-l-2 border-purple-200 pl-3 bg-purple-50/30 py-1 rounded-r">
                        "{item.quote}"
                    </div>

                    {/* Suggestion */}
                    <div className="text-xs text-gray-700 mb-2">
                        <strong>Fix: </strong> {item.suggestion}
                    </div>

                    {/* Alternatives / Fix Options */}
                    {item.alternatives && item.alternatives.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                             <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Suggested Alternatives</p>
                             <div className="flex flex-wrap gap-2">
                                 {item.alternatives.map((alt, i) => (
                                     <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">
                                         {alt}
                                     </span>
                                 ))}
                             </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )}
  </div>
  );
};