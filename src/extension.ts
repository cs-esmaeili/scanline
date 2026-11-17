import * as vscode from 'vscode';
import { closeOverlay, showOverlay, type Presentation } from './overlay';
import { clearQuickSearchHistory, openQuickSearch } from './quickpick';

type UiMode = 'overlay' | 'quickpick';

export function activate(context: vscode.ExtensionContext): void {
  const initial = (): string => selectionText();

  context.subscriptions.push(
    vscode.commands.registerCommand('vsSearch.search', () => {
      if (uiMode() === 'quickpick') {
        void openQuickSearch(context, { initial: initial() });
      } else {
        showOverlay(context, { initial: initial(), mode: presentationMode() });
      }
    }),
    vscode.commands.registerCommand('vsSearch.overlay', () =>
      showOverlay(context, { initial: initial(), mode: 'overlay' })
    ),
    vscode.commands.registerCommand('vsSearch.page', () =>
      showOverlay(context, { initial: initial(), mode: 'page' })
    ),
    vscode.commands.registerCommand('vsSearch.quickPick', () =>
      openQuickSearch(context, { initial: initial() })
    ),
    vscode.commands.registerCommand('vsSearch.searchSelection', () => {
      if (uiMode() === 'quickpick') {
        void openQuickSearch(context, { initial: initial() });
      } else {
        showOverlay(context, { initial: initial(), mode: presentationMode() });
      }
    }),
    vscode.commands.registerCommand('vsSearch.searchToSide', () => {
      if (uiMode() === 'quickpick') {
        void openQuickSearch(context, { toSide: true, initial: initial() });
      } else {
        showOverlay(context, { initial: initial(), mode: presentationMode() });
      }
    }),
    vscode.commands.registerCommand('vsSearch.close', () => closeOverlay()),
    vscode.commands.registerCommand('vsSearch.clearHistory', () => clearQuickSearchHistory(context))
  );
}

export function deactivate(): void {
  closeOverlay();
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('vsSearch');
}

function uiMode(): UiMode {
  return config().get<UiMode>('ui', 'overlay');
}

function presentationMode(): Presentation {
  return config().get<Presentation>('presentation', 'overlay');
}

function selectionText(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return '';
  }
  for (const selection of editor.selections) {
    const text = editor.document.getText(selection);
    if (text.trim()) {
      // The search input is single-line.
      return text.split(/\r?\n/)[0].trim();
    }
  }
  return '';
}
