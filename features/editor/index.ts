/**
 * Editor Feature
 * 
 * Core text editing, magic bar, and version control
 */

// Components
export { RichTextEditor } from './components/RichTextEditor';
export { MagicBar } from './components/MagicBar';
export { FindReplaceModal } from './components/FindReplaceModal';
export { VisualDiff } from './components/VisualDiff';
export { DiffViewer } from './components/DiffViewer';
export { EditorWorkspace } from './components/EditorWorkspace';
export { CommentCard } from './components/CommentCard';
export { VersionControlPanel } from './components/VersionControlPanel';

// Hooks
export { useMagicEditor } from './hooks/useMagicEditor';
export { useAutoResize } from './hooks/useAutoResize';
export { useBranching, type UseBranchingOptions, type UseBranchingResult } from './hooks/useBranching';
export { useInlineComments, type UseInlineCommentsOptions, type UseInlineCommentsResult } from './hooks/useInlineComments';
export { useDocumentHistory } from './hooks/useDocumentHistory';
export { 
  useChunkIndex, 
  useChunkIndexSync,
  type UseChunkIndexOptions,
  type UseChunkIndexReturn,
  type ChunkIndexState,
} from './hooks/useChunkIndex';

// Extensions
export { CommentMark } from './extensions/CommentMark';
