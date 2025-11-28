import { useState, useCallback, useEffect, useRef } from 'react';
import { HistoryItem } from '../types';

export function useDocumentHistory(
    initialText: string, 
    chapterId: string | null,
    onSave: (text: string) => void
) {
  const [text, setText] = useState(initialText);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Ref to track if we just switched chapters to avoid auto-saving initial load as a change
  const isFirstLoad = useRef(true);

  // When chapter changes, reset the local state to the new chapter's content
  useEffect(() => {
      setText(initialText);
      setHistory([]);
      isFirstLoad.current = true;
  }, [initialText, chapterId]);

  // Raw update (for typing) - updates local state only
  const updateText = useCallback((newText: string) => {
      setText(newText);
      // Debounced save could happen here, but we'll rely on the parent/store for persistence
      // We call onSave immediately here for the store to stay in sync, 
      // relying on the store's efficient IndexedDB writes.
      onSave(newText);
  }, [onSave]);

  // Commit change (for agent/magic/restore) - adds to history AND saves
  const commit = useCallback((newText: string, description: string, author: 'User' | 'Agent') => {
    setText(prev => {
      const newItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        description,
        author,
        previousContent: prev,
        newContent: newText
      };
      setHistory(prevHist => [...prevHist, newItem]);
      return newText;
    });
    onSave(newText);
  }, [onSave]);

  const undo = useCallback(() => {
    let success = false;
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const lastItem = prev[prev.length - 1];
      setText(lastItem.previousContent);
      onSave(lastItem.previousContent);
      success = true;
      return prev.slice(0, -1);
    });
    return success;
  }, [onSave]);

  const restore = useCallback((id: string) => {
     const item = history.find(h => h.id === id);
     if(item) {
         commit(item.newContent, `Reverted to version from ${new Date(item.timestamp).toLocaleTimeString()}`, 'User');
     }
  }, [history, commit]);

  const reset = useCallback((newText: string) => {
      setText(newText);
      setHistory([]);
      onSave(newText);
  }, [onSave]);

  return { 
    text, 
    updateText,
    commit,
    history, 
    undo, 
    restore, 
    reset,
    hasUnsavedChanges: history.length > 0 
  };
}