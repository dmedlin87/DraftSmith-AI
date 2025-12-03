import type { AppBrainCommand, GenerationDependencies } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Generation Commands
// ─────────────────────────────────────────────────────────────────────────────

export interface RewriteSelectionParams {
  mode: 'expand' | 'condense' | 'rephrase' | 'formalize' | 'casual';
  targetTone?: string;
}

export class RewriteSelectionCommand
  implements AppBrainCommand<RewriteSelectionParams, string, GenerationDependencies>
{
  async execute(
    params: RewriteSelectionParams,
    deps: GenerationDependencies,
  ): Promise<string> {
    const { mode, targetTone } = params;

    if (!deps.selection) {
      return 'No text selected. Please select text to rewrite.';
    }

    const { text: selectedText, start, end } = deps.selection;

    if (selectedText.trim().length === 0) {
      return 'Selected text is empty. Please select text to rewrite.';
    }

    return deps.runExclusiveEdit(async () => {
      const rewritten = await deps.generateRewrite(selectedText, mode, targetTone);

      const before = deps.currentText.slice(0, start);
      const after = deps.currentText.slice(end);
      const newText = before + rewritten + after;

      const description = `Rewrite (${mode})${targetTone ? ` with ${targetTone} tone` : ''}`;
      deps.commitEdit(newText, description, 'Agent');

      return `Rewrote selection using ${mode} mode. ${rewritten.length - selectedText.length > 0 ? 'Expanded' : 'Condensed'} by ${Math.abs(rewritten.length - selectedText.length)} characters.`;
    });
  }
}

export class ContinueWritingCommand
  implements AppBrainCommand<void, string, GenerationDependencies>
{
  async execute(_params: void, deps: GenerationDependencies): Promise<string> {
    const text = deps.currentText;

    if (text.trim().length < 50) {
      return 'Not enough context to continue. Please write at least a paragraph first.';
    }

    const insertionPoint = deps.selection?.end ?? text.length;
    const contextStart = Math.max(0, insertionPoint - 500);
    const contextWindow = deps.currentText.slice(contextStart, insertionPoint);

    return deps.runExclusiveEdit(async () => {
      const continuation = await deps.generateContinuation({
        context: contextWindow,
        selection: deps.selection?.text,
      });

      const before = deps.currentText.slice(0, insertionPoint);
      const after = deps.currentText.slice(insertionPoint);

      const needsNewline = before.length > 0 && !before.endsWith('\n');
      const separator = needsNewline ? '\n\n' : '';

      const newText = `${before}${separator}${continuation}${after}`;
      deps.commitEdit(newText, 'AI continuation', 'Agent');

      const wordCount = continuation.trim().split(/\s+/).filter(Boolean).length;

      return `Added ${wordCount} words of continuation.`;
    });
  }
}

export interface SuggestDialogueParams {
  character: string;
  context?: string;
}

export class SuggestDialogueCommand
  implements AppBrainCommand<SuggestDialogueParams, string, GenerationDependencies>
{
  async execute(
    params: SuggestDialogueParams,
    deps: GenerationDependencies,
  ): Promise<string> {
    const { character, context } = params;

    // Get recent context if not provided
    const contextWindow = context || deps.currentText.slice(-300);

    return deps.runExclusiveEdit(async () => {
      const dialogue = await deps.generateRewrite(
        `[Generate dialogue for ${character}]`,
        'rephrase',
        `in-character as ${character}`
      );

      // Insert at end (could be enhanced to insert at cursor)
      const newText = deps.currentText + '\n\n' + dialogue;
      deps.commitEdit(newText, `Dialogue suggestion for ${character}`, 'Agent');

      return `Generated dialogue for ${character}.`;
    });
  }
}
