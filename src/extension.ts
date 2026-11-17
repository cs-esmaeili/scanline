import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { closeSearchPage, showSearchPage } from './page';
import { openNativeSearch } from './native';

export function activate(context: vscode.ExtensionContext): void {
  syncDesktopWorkspace();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => syncDesktopWorkspace()),
    vscode.commands.registerCommand('scanline.search', () =>
      showSearchPage(context, { initial: selectionText() })
    ),
    vscode.commands.registerCommand('scanline.searchSelection', () =>
      showSearchPage(context, { initial: selectionText() })
    ),
    vscode.commands.registerCommand('scanline.searchToSide', () => searchToSide()),
    vscode.commands.registerCommand('scanline.close', () => closeSearchPage()),
    vscode.commands.registerCommand('scanline.searchInFolder', (uri?: vscode.Uri) => {
      const folder = uri ?? vscode.window.activeTextEditor?.document.uri;
      const fsPath = folder ? folder.fsPath : '';
      const scope = fsPath ? (isDirectory(fsPath) ? fsPath : path.dirname(fsPath)) : '';
      showSearchPage(context, { scope });
    })
  );
}

export function deactivate(): void {
  closeSearchPage();
}

function isDirectory(fsPath: string): boolean {
  try {
    return fs.statSync(fsPath).isDirectory();
  } catch {
    return false;
  }
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
    const dir = path.join(os.homedir(), '.config', 'scanline');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'workspace.json'),
      JSON.stringify({ roots, updated: new Date().toISOString() }, null, 2)
    );
  } catch {
    // best effort: the desktop overlay falls back to $HOME
  }
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
