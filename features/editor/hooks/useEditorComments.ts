import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Chapter, InlineComment } from '@/types/schema';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';

interface UseEditorCommentsResult {
  inlineComments: InlineComment[];
  visibleComments: InlineComment[];
  setInlineComments: (comments: InlineComment[]) => void;
  dismissComment: (commentId: string) => void;
  clearComments: () => void;
}

export const useEditorComments = (
  activeChapter: Chapter | undefined,
): UseEditorCommentsResult => {
  const [inlineComments, setInlineCommentsState] = useState<InlineComment[]>(
    activeChapter?.comments || [],
  );

  const critiqueIntensity = useSettingsStore((state) => state.critiqueIntensity);

  useEffect(() => {
    if (activeChapter) {
      setInlineCommentsState(activeChapter.comments || []);
    } else {
      setInlineCommentsState([]);
    }
  }, [activeChapter]);

  const setInlineComments = useCallback((comments: InlineComment[]) => {
    setInlineCommentsState(comments);
  }, []);

  const dismissComment = useCallback((commentId: string) => {
    setInlineCommentsState(prev =>
      prev.map(c => (c.id === commentId ? { ...c, dismissed: true } : c)),
    );
  }, []);

  const clearComments = useCallback(() => {
    setInlineCommentsState([]);
  }, []);

  const visibleComments = useMemo(() => {
    let allowedSeverities: InlineComment['severity'][];

    switch (critiqueIntensity) {
      case 'developmental':
        allowedSeverities = ['error'];
        break;
      case 'standard':
        allowedSeverities = ['error', 'warning'];
        break;
      case 'intensive':
      default:
        allowedSeverities = ['error', 'warning', 'info'];
        break;
    }

    return inlineComments.filter(
      (comment) => !comment.dismissed && allowedSeverities.includes(comment.severity),
    );
  }, [inlineComments, critiqueIntensity]);

  return {
    inlineComments,
    visibleComments,
    setInlineComments,
    dismissComment,
    clearComments,
  };
};
