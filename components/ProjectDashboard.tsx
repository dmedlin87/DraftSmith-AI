import React, { useState, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { parseManuscript, ParsedChapter } from '../services/manuscriptParser';
import { ImportWizard } from './ImportWizard';

export const ProjectDashboard: React.FC = () => {
  const { projects, loadProject, createProject, importProject } = useProjectStore();
  
  // Modal State for Metadata
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [importedContent, setImportedContent] = useState<string | null>(null);
  
  // Wizard State
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[] | null>(null);
  
  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
      setNewTitle('');
      setNewTime('');
      setNewLocation('');
      setImportedContent(null);
      setParsedChapters(null);
      setIsModalOpen(false);
  };

  const handleCreateOrNext = async () => {
    if (!newTitle.trim()) return;
    
    // If this is an Import workflow
    if (importedContent !== null) {
        // Run Parser
        const chapters = parseManuscript(importedContent);
        setParsedChapters(chapters);
        setIsModalOpen(false); // Close metadata modal, open wizard (handled by render)
        return;
    } 

    // Create New Project (No Import)
    const setting = (newTime || newLocation) ? {
        timePeriod: newTime || 'Contemporary',
        location: newLocation || 'General'
    } : undefined;

    await createProject(newTitle, 'Me', setting);
    resetForm();
  };

  const handleWizardConfirm = async (finalChapters: ParsedChapter[]) => {
      const setting = (newTime || newLocation) ? {
          timePeriod: newTime || 'Contemporary',
          location: newLocation || 'General'
      } : undefined;

      await importProject(newTitle, finalChapters, 'Me', setting);
      resetForm();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const text = await file.text();
          const cleanName = file.name.replace(/\.[^/.]+$/, ""); // remove extension
          
          setImportedContent(text);
          setNewTitle(cleanName);
          setIsModalOpen(true); // Open modal to confirm details/settings
      } catch (err) {
          alert("Failed to read file.");
      }
      
      // Reset input value so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Render Import Wizard ---
  if (parsedChapters) {
      return (
          <ImportWizard 
             initialChapters={parsedChapters} 
             onConfirm={handleWizardConfirm}
             onCancel={resetForm}
          />
      );
  }

  // --- Render Dashboard ---
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-white h-full relative">
      {isModalOpen && (
          <div className="absolute inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
                  <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">
                      {importedContent ? "Import Draft Settings" : "Start a New Novel"}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                      {importedContent ? "We'll attempt to detect chapters. You can review them in the next step." : "Tell us a bit about your new book."}
                  </p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Book Title</label>
                          <input 
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. The Winds of Winter"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            autoFocus
                          />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Time Period</label>
                            <input 
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                placeholder="e.g. 1890s, 2050"
                                value={newTime}
                                onChange={e => setNewTime(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                            <input 
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                placeholder="e.g. London, Mars"
                                value={newLocation}
                                onChange={e => setNewLocation(e.target.value)}
                            />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">Defining the setting helps the AI detect anachronisms and tone mismatches.</p>
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                      <button 
                        onClick={resetForm}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                          Cancel
                      </button>
                      <button 
                        onClick={handleCreateOrNext}
                        disabled={!newTitle.trim()}
                        className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                          {importedContent ? "Next: Review Chapters" : "Create Project"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="min-h-full flex items-center justify-center p-6 py-12">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-4">
              DraftSmith Library
            </h1>
            <p className="text-lg text-gray-600 font-light">
              Select a novel to continue writing or start a new masterpiece.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* New Project Card */}
            <button 
              onClick={() => {
                  setImportedContent(null);
                  setIsModalOpen(true);
              }}
              className="flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed border-gray-300 rounded-2xl hover:border-indigo-400 hover:bg-gray-50 transition-all group h-48"
            >
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="font-semibold text-gray-700">Create New Novel</span>
            </button>

            {/* Import Card */}
            <div className="relative">
                <input 
                    type="file" 
                    accept=".txt,.md"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-48 flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed border-gray-300 rounded-2xl hover:border-purple-400 hover:bg-purple-50 transition-all group"
                >
                    <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                        </svg>
                    </div>
                    <span className="font-semibold text-gray-700">Import Draft (.txt/.md)</span>
                </button>
            </div>

            {/* Existing Projects */}
            {projects.map(project => (
              <button 
                key={project.id}
                onClick={() => loadProject(project.id)}
                className="flex flex-col items-start p-8 bg-white border border-gray-200 rounded-2xl hover:shadow-xl hover:border-indigo-200 transition-all text-left h-48 relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-white rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                <h3 className="font-serif font-bold text-xl text-gray-900 mb-2 relative z-10 truncate w-full">{project.title}</h3>
                <p className="text-sm text-gray-500 mb-2 relative z-10">by {project.author}</p>
                {project.setting && (
                     <div className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block mb-3 relative z-10">
                         {project.setting.timePeriod} • {project.setting.location}
                     </div>
                )}
                <div className="mt-auto flex items-center gap-2 text-xs text-gray-400 relative z-10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Last edited {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};