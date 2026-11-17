import * as vscode from 'vscode';
import { closeOverlay, showOverlay, type Presentation } from './overlay';
import { openNativeSearch } from './native';
import { openQuickSearch } from './nativeQuickPick';

type PresentationMode = 'quickpick' | 'overlay' | 'page';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vsSearch.search', () => dispatch(context)),
    vscode.commands.registerCommand('vsSearch.quickPick', () =>
      openQuickSearch(context, { initial: selectionText() })
    ),
    vscode.commands.registerCommand('vsSearch.overlay', () =>
      showOverlay(context, { initial: selectionText(), mode: 'overlay' })
    ),
    vscode.commands.registerCommand('vsSearch.page', () =>
      showOverlay(context, { initial: selectionText(), mode: 'page' })
    ),
    vscode.commands.registerCommand('vsSearch.searchSelection', () => dispatch(context)),
    vscode.commands.registerCommand('vsSearch.searchToSide', () => searchToSide()),
    vscode.commands.registerCommand('vsSearch.close', () => closeOverlay())
  );
}

export function deactivate(): void {
  closeOverlay();
}

function dispatch(context: vscode.ExtensionContext): void {
  const initial = selectionText();
  const mode = presentationMode();

  if (mode === 'quickpick') {
    openQuickSearch(context, { initial });
    return;
  }

  showOverlay(context, { initial, mode });
}

async function searchToSide(): Promise<void> {
  const selection = selectionText();
  const query =
    selection ||
    (await vscode.window.showInputBox({
      prompt: 'Search in files with VS Code search',
      placeHolder: 'Text to search',
    }));

  if (!query || !query.trim()) {
    return;
  }

  await openNativeSearch(query.trim(), { toSide: true });
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('vsSearch');
}

function presentationMode(): PresentationMode {
  return config().get<PresentationMode>('presentation', 'quickpick');
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
