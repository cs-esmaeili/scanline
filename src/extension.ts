import * as vscode from 'vscode';
import { closeOverlay, showOverlay } from './overlay';
import { clearQuickSearchHistory, openQuickSearch } from './quickpick';

type UiMode = 'overlay' | 'quickpick';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vsSearch.search', () => dispatch(context)),
    vscode.commands.registerCommand('vsSearch.overlay', () =>
      showOverlay(context, { initial: selectionText() })
    ),
    vscode.commands.registerCommand('vsSearch.quickPick', () =>
      openQuickSearch(context, { initial: selectionText() })
    ),
    vscode.commands.registerCommand('vsSearch.searchSelection', () => {
      const initial = selectionText();
      if (uiMode() === 'overlay') {
        showOverlay(context, { initial });
      } else {
        void openQuickSearch(context, { initial });
      }
    }),
    vscode.commands.registerCommand('vsSearch.searchToSide', () => {
      if (uiMode() === 'overlay') {
        showOverlay(context, { initial: selectionText() });
      } else {
        void openQuickSearch(context, { toSide: true, initial: selectionText() });
      }
    }),
    vscode.commands.registerCommand('vsSearch.close', () => closeOverlay()),
    vscode.commands.registerCommand('vsSearch.clearHistory', () => clearQuickSearchHistory(context))
  );
}

export function deactivate(): void {
  closeOverlay();
}

function dispatch(context: vscode.ExtensionContext): void {
  const initial = selectionText();
  if (uiMode() === 'overlay') {
    showOverlay(context, { initial });
  } else {
    void openQuickSearch(context, { initial });
  }
}

function uiMode(): UiMode {
  return vscode.workspace.getConfiguration('vsSearch').get<UiMode>('ui', 'overlay');
}

function selectionText(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return '';
  }
  for (const selection of editor.selections) {
    const text = editor.document.getText(selection);
    if (text.trim()) {
      // The overlay input is single-line.
      return text.split(/\r?\n/)[0].trim();
    }
  }
  return '';
}
