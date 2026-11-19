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
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('scanline.desktopSync')) {
        syncDesktopWorkspace();
      }
    }),
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
 * The optional desktop overlay needs to know which folders to search. Writing a
 * file in the user's home directory is only done when the user explicitly opts
 * in with `scanline.desktopSync`, and the file is created with owner-only
 * permissions.
 */
function syncDesktopWorkspace(): void {
  const enabled = vscode.workspace.getConfiguration('scanline').get<boolean>('desktopSync', false);
  if (!enabled) {
    return;
  }

  try {
    const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    if (!roots.length) {
      return;
    }
    const dir = path.join(os.homedir(), '.config', 'scanline');
    const target = path.join(dir, 'workspace.json');
    const temp = `${target}.${process.pid}.tmp`;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      temp,
      JSON.stringify({ roots, updated: new Date().toISOString() }, null, 2),
      { mode: 0o600 }
    );
    fs.renameSync(temp, target);
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
