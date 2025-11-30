import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/features/project';
import { CharacterProfile } from '@/types';
import { Lore } from '@/types/schema';

interface CharacterEditorProps {
  character: CharacterProfile;
  onSave: (character: CharacterProfile) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onInterview?: (character: CharacterProfile) => void;
}

const CharacterEditor: React.FC<CharacterEditorProps> = ({ character, onSave, onCancel, onDelete, onInterview }) => {
  const [form, setForm] = useState<CharacterProfile>({ ...character });
  const [newRelationship, setNewRelationship] = useState({ name: '', type: '', dynamic: '' });
  const [newPlotThread, setNewPlotThread] = useState('');

  const handleChange = (field: keyof CharacterProfile, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addRelationship = () => {
    if (newRelationship.name && newRelationship.type) {
      setForm((prev) => ({
        ...prev,
        relationships: [...(prev.relationships || []), { ...newRelationship }],
      }));
      setNewRelationship({ name: '', type: '', dynamic: '' });
    }
  };

  const removeRelationship = (index: number) => {
    setForm((prev) => ({
      ...prev,
      relationships: prev.relationships.filter((_, i) => i !== index),
    }));
  };

  const addPlotThread = () => {
    if (newPlotThread.trim()) {
      setForm((prev) => ({
        ...prev,
        plotThreads: [...(prev.plotThreads || []), newPlotThread.trim()],
      }));
      setNewPlotThread('');
    }
  };

  const removePlotThread = (index: number) => {
    setForm((prev) => ({
      ...prev,
      plotThreads: prev.plotThreads.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full px-3 py-2 bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--magic-400)] focus:border-transparent"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Biography</label>
        <textarea
          value={form.bio}
          onChange={(e) => handleChange('bio', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded-lg text-sm font-serif resize-none focus:outline-none focus:ring-2 focus:ring-[var(--magic-400)] focus:border-transparent"
        />
      </div>

      {/* Arc */}
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Character Arc</label>
        <textarea
          value={form.arc}
          onChange={(e) => handleChange('arc', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded-lg text-sm font-serif resize-none focus:outline-none focus:ring-2 focus:ring-[var(--magic-400)] focus:border-transparent"
        />
      </div>

      {/* Relationships */}
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-2">Relationships</label>
        <div className="space-y-2 mb-2">
          {form.relationships?.map((rel, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-[var(--parchment-100)] rounded-lg">
              <span className="flex-1 text-sm">
                <strong>{rel.name}</strong> ({rel.type})
                {rel.dynamic && <span className="text-[var(--ink-500)]"> - {rel.dynamic}</span>}
              </span>
              <button
                onClick={() => removeRelationship(i)}
                className="w-6 h-6 flex items-center justify-center text-[var(--error-500)] hover:bg-[var(--error-100)] rounded"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Name"
            value={newRelationship.name}
            onChange={(e) => setNewRelationship((prev) => ({ ...prev, name: e.target.value }))}
            className="flex-1 px-2 py-1 text-sm bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--magic-400)]"
          />
          <input
            type="text"
            placeholder="Type"
            value={newRelationship.type}
            onChange={(e) => setNewRelationship((prev) => ({ ...prev, type: e.target.value }))}
            className="w-24 px-2 py-1 text-sm bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--magic-400)]"
          />
          <button
            onClick={addRelationship}
            className="px-3 py-1 bg-[var(--magic-100)] text-[var(--magic-600)] rounded text-sm font-medium hover:bg-[var(--magic-200)] transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Plot Threads */}
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-2">Plot Threads</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.plotThreads?.map((thread, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--parchment-200)] rounded-full text-xs"
            >
              {thread}
              <button
                onClick={() => removePlotThread(i)}
                className="w-4 h-4 flex items-center justify-center text-[var(--ink-400)] hover:text-[var(--error-500)]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add plot thread..."
            value={newPlotThread}
            onChange={(e) => setNewPlotThread(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPlotThread()}
            className="flex-1 px-2 py-1 text-sm bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--magic-400)]"
          />
          <button
            onClick={addPlotThread}
            className="px-3 py-1 bg-[var(--magic-100)] text-[var(--magic-600)] rounded text-sm font-medium hover:bg-[var(--magic-200)] transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Development Suggestion */}
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Development Notes</label>
        <textarea
          value={form.developmentSuggestion}
          onChange={(e) => handleChange('developmentSuggestion', e.target.value)}
          rows={2}
          placeholder="Notes for character development..."
          className="w-full px-3 py-2 bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded-lg text-sm font-serif resize-none focus:outline-none focus:ring-2 focus:ring-[var(--magic-400)] focus:border-transparent"
        />
      </div>

      {onInterview && (
        <div className="flex justify-end">
          <button
            onClick={() => onInterview(form)}
            className="text-[11px] px-3 py-1 border border-[var(--magic-200)] text-[var(--magic-600)] rounded-full hover:bg-[var(--magic-50)] transition-colors"
          >
            💬 Interview {form.name || 'Character'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--ink-100)]">
        <button
          onClick={() => onSave(form)}
          className="flex-1 py-2 bg-[var(--magic-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--magic-600)] transition-colors"
        >
          Save Character
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-[var(--parchment-100)] border border-[var(--ink-200)] rounded-lg text-sm text-[var(--ink-600)] hover:bg-[var(--parchment-200)] transition-colors"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="px-4 py-2 bg-[var(--error-100)] text-[var(--error-600)] rounded-lg text-sm font-medium hover:bg-[var(--error-200)] transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

interface CharacterCardProps {
  character: CharacterProfile;
  onEdit: () => void;
  onInterview?: () => void;
  isSelected: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onEdit, onInterview, isSelected }) => (
  <div
    onClick={onEdit}
    className={`
      p-4 rounded-xl border-2 cursor-pointer transition-all
      ${isSelected 
        ? 'border-[var(--magic-400)] bg-[var(--magic-50)] shadow-md' 
        : 'border-[var(--ink-100)] bg-[var(--parchment-50)] hover:border-[var(--magic-300)] hover:shadow-sm'}
    `}
  >
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--magic-300)] to-[var(--magic-500)] flex items-center justify-center text-white font-bold text-lg">
        {character.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-serif font-semibold text-[var(--ink-800)] truncate">{character.name}</h4>
        <p className="text-xs text-[var(--ink-500)] line-clamp-2 mt-1">{character.bio || 'No biography'}</p>
        {character.relationships && character.relationships.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs text-[var(--ink-400)]">{character.relationships.length} relationships</span>
          </div>
        )}
      </div>
    </div>
    {onInterview && (
      <div className="mt-4 flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInterview();
          }}
          className="text-xs px-3 py-1 border border-[var(--magic-200)] text-[var(--magic-600)] rounded-full hover:bg-[var(--magic-50)] transition-colors"
        >
          💬 Interview {character.name}
        </button>
      </div>
    )}
  </div>
);

interface LoreManagerProps {
  onInterviewCharacter?: (character: CharacterProfile) => void;
}

export const LoreManager: React.FC<LoreManagerProps> = ({ onInterviewCharacter }) => {
  const { currentProject, updateProjectLore } = useProjectStore();
  const [activeTab, setActiveTab] = useState<'characters' | 'world'>('characters');
  const [editingCharacter, setEditingCharacter] = useState<CharacterProfile | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [worldRules, setWorldRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState('');

  // Initialize from project lore
  useEffect(() => {
    if (currentProject?.lore) {
      setWorldRules(currentProject.lore.worldRules || []);
    }
  }, [currentProject?.lore]);

  const characters = currentProject?.lore?.characters || [];

  const saveLore = (updatedCharacters?: CharacterProfile[], updatedRules?: string[]) => {
    if (!currentProject) return;

    const newLore: Lore = {
      characters: updatedCharacters ?? characters,
      worldRules: updatedRules ?? worldRules,
    };

    updateProjectLore(currentProject.id, newLore);
  };

  const beginInterview = (character: CharacterProfile) => {
    if (onInterviewCharacter) {
      onInterviewCharacter(character);
    }
  };

  const handleSaveCharacter = (character: CharacterProfile) => {
    const updatedCharacters = isCreatingNew
      ? [...characters, character]
      : characters.map((c) => (c.name === editingCharacter?.name ? character : c));

    saveLore(updatedCharacters);
    setEditingCharacter(null);
    setIsCreatingNew(false);
  };

  const handleDeleteCharacter = () => {
    if (!editingCharacter) return;
    const updatedCharacters = characters.filter((c) => c.name !== editingCharacter.name);
    saveLore(updatedCharacters);
    setEditingCharacter(null);
  };

  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setEditingCharacter({
      name: '',
      bio: '',
      arc: '',
      arcStages: [],
      relationships: [],
      plotThreads: [],
      inconsistencies: [],
      developmentSuggestion: '',
    });
  };

  const addWorldRule = () => {
    if (newRule.trim()) {
      const updatedRules = [...worldRules, newRule.trim()];
      setWorldRules(updatedRules);
      saveLore(undefined, updatedRules);
      setNewRule('');
    }
  };

  const removeWorldRule = (index: number) => {
    const updatedRules = worldRules.filter((_, i) => i !== index);
    setWorldRules(updatedRules);
    saveLore(undefined, updatedRules);
  };

  const updateWorldRule = (index: number, value: string) => {
    const updatedRules = [...worldRules];
    updatedRules[index] = value;
    setWorldRules(updatedRules);
    saveLore(undefined, updatedRules);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--ink-100)] shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('characters')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'characters'
                ? 'bg-[var(--magic-100)] text-[var(--magic-600)]'
                : 'text-[var(--ink-500)] hover:bg-[var(--parchment-100)]'
            }`}
          >
            Characters ({characters.length})
          </button>
          <button
            onClick={() => setActiveTab('world')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'world'
                ? 'bg-[var(--magic-100)] text-[var(--magic-600)]'
                : 'text-[var(--ink-500)] hover:bg-[var(--parchment-100)]'
            }`}
          >
            World Rules ({worldRules.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'characters' ? (
          editingCharacter ? (
            <div>
              <button
                onClick={() => {
                  setEditingCharacter(null);
                  setIsCreatingNew(false);
                }}
                className="flex items-center gap-1 text-sm text-[var(--ink-500)] hover:text-[var(--ink-700)] mb-4"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Back to list
              </button>
              <h3 className="font-serif text-lg font-semibold text-[var(--ink-800)] mb-4">
                {isCreatingNew ? 'New Character' : `Edit: ${editingCharacter.name}`}
              </h3>
              <CharacterEditor
                character={editingCharacter}
                onSave={handleSaveCharacter}
                onCancel={() => {
                  setEditingCharacter(null);
                  setIsCreatingNew(false);
                }}
                onDelete={isCreatingNew ? undefined : handleDeleteCharacter}
                onInterview={beginInterview}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {characters.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--parchment-200)] flex items-center justify-center mx-auto mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--ink-400)]">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                      <path d="M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                  </div>
                  <p className="text-[var(--ink-500)] mb-4">No characters in your Lore Bible yet.</p>
                  <button
                    onClick={handleCreateNew}
                    className="px-4 py-2 bg-[var(--magic-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--magic-600)] transition-colors"
                  >
                    Add Your First Character
                  </button>
                </div>
              ) : (
                <>
                  {characters.map((char, i) => (
                  <CharacterCard
                    key={i}
                    character={char}
                    onEdit={() => setEditingCharacter(char)}
                    onInterview={() => beginInterview(char)}
                    isSelected={false}
                  />
                  ))}
                  <button
                    onClick={handleCreateNew}
                    className="w-full py-4 border-2 border-dashed border-[var(--ink-200)] rounded-xl text-[var(--ink-500)] hover:border-[var(--magic-300)] hover:text-[var(--magic-500)] transition-colors flex items-center justify-center gap-2"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Character
                  </button>
                </>
              )}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ink-500)] mb-4">
              Define the rules and constraints of your story's world. These help maintain consistency across your manuscript.
            </p>
            
            {worldRules.map((rule, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-[var(--parchment-50)] border border-[var(--ink-100)] rounded-lg group">
                <div className="w-6 h-6 rounded bg-[var(--magic-100)] text-[var(--magic-600)] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <textarea
                  value={rule}
                  onChange={(e) => updateWorldRule(i, e.target.value)}
                  rows={2}
                  className="flex-1 bg-transparent text-sm font-serif resize-none focus:outline-none"
                />
                <button
                  onClick={() => removeWorldRule(i)}
                  className="w-6 h-6 flex items-center justify-center text-[var(--ink-300)] hover:text-[var(--error-500)] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}

            <div className="flex gap-2">
              <input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addWorldRule()}
                placeholder="Add a world rule (e.g., 'Magic requires spoken words to activate')"
                className="flex-1 px-3 py-2 bg-[var(--parchment-50)] border border-[var(--ink-200)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--magic-400)] focus:border-transparent"
              />
              <button
                onClick={addWorldRule}
                className="px-4 py-2 bg-[var(--magic-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--magic-600)] transition-colors"
              >
                Add
              </button>
            </div>

            {worldRules.length === 0 && (
              <div className="text-center py-6 text-[var(--ink-400)] text-sm">
                No world rules defined yet. Add rules to help maintain consistency.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
