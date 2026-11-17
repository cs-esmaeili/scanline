import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { closeOverlay, showOverlay, type Presentation } from './overlay';
import { openNativeSearch } from './native';
import { openQuickSearch } from './nativeQuickPick';

type PresentationMode = 'quickpick' | 'overlay' | 'page';

export function activate(context: vscode.ExtensionContext): void {
  syncDesktopWorkspace();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => syncDesktopWorkspace()),
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

/**
 * The standalone desktop overlay needs to know which folders to search.
 * Write the current workspace roots where desktop/search.js can read them.
 */
function syncDesktopWorkspace(): void {
  try {
    const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    if (!roots.length) {
      return;
    }
    const dir = path.join(os.homedir(), '.config', 'vs-search');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'workspace.json'),
      JSON.stringify({ roots, updated: new Date().toISOString() }, null, 2)
    );
  } catch {
    // best effort: the desktop overlay falls back to $HOME
  }
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
