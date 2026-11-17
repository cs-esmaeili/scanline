import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  cancelTextSearch,
  parseTypes,
  searchAll,
  type ResultGroups,
  type ResultItem,
  type TabId,
} from './search';
import { openNativeSearch } from './native';

/**
 * The search page: one editor tab, full-page UI, stays open like a normal
 * editor. Opened from the top-right icon (editor/title) or the hotkey.
 *
 * The webview only renders; all searching happens in the extension host via
 * VS Code's own file/symbol/command APIs and ripgrep.
 */

interface SearchSession {
  panel: vscode.WebviewPanel;
  groups: ResultGroups;
  query: string;
  scope: string;
  types: string;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  disposed: boolean;
}

let session: SearchSession | undefined;

const EMPTY_GROUPS: ResultGroups = { files: [], text: [], symbols: [], actions: [] };

export interface PageOptions {
  initial?: string;
  tab?: TabId;
  scope?: string;
}

export function showSearchPage(context: vscode.ExtensionContext, options: PageOptions = {}): void {
  if (session && !session.disposed) {
    session.panel.reveal(undefined, false);
    post(session, { type: 'focus' });
    if (options.initial || options.scope) {
      post(session, initMessage(options));
    }
    return;
  }

  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel(
    'vsSearch.page',
    'Search Everywhere',
    // Like Claude Code: a half-screen tab beside the current editor.
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    }
  );
  panel.title = 'Search Everywhere';
  panel.iconPath = vscode.Uri.joinPath(mediaRoot, 'icon.svg');

  const current: SearchSession = {
    panel,
    groups: EMPTY_GROUPS,
    query: '',
    scope: options.scope ?? '',
    types: '',
    generation: 0,
    disposed: false,
  };
  session = current;

  panel.webview.html = buildHtml(panel.webview, mediaRoot, theme());

  panel.webview.onDidReceiveMessage(
    (message: {
      type?: string;
      value?: string;
      scope?: string;
      types?: string;
      item?: ResultItem;
      alt?: boolean;
      tab?: TabId;
    }) => {
      if (!message?.type) {
        return;
      }
      switch (message.type) {
        case 'ready':
          post(current, initMessage(options));
          break;
        case 'query':
          schedule(current, message.value ?? '', message.scope ?? '', message.types ?? '');
          break;
        case 'browseScope':
          void pickFolder(current);
          break;
        case 'accept':
          void accept(current, message.item, message.alt === true);
          break;
        case 'close':
          dispose(current);
          break;
        default:
          break;
      }
    }
  );

  // Normal editor tab: coming back re-focuses the query input.
  panel.onDidChangeViewState((event) => {
    if (event.webviewPanel.visible) {
      post(current, { type: 'focus' });
    }
  });

  panel.onDidDispose(() => {
    current.disposed = true;
    cancelTextSearch();
    if (current.timer) {
      clearTimeout(current.timer);
    }
    if (session === current) {
      session = undefined;
    }
  });
}

export function closeSearchPage(): void {
  if (session) {
    dispose(session);
  }
}

function schedule(current: SearchSession, query: string, scope: string, types: string): void {
  current.query = query;
  current.scope = scope;
  current.types = types;
  cancelTextSearch();
  if (current.timer) {
    clearTimeout(current.timer);
  }
  current.timer = setTimeout(() => {
    void run(current);
  }, 70);
}

async function run(current: SearchSession): Promise<void> {
  const query = current.query;
  const generation = ++current.generation;

  if (!query.trim()) {
    current.groups = EMPTY_GROUPS;
    post(current, { type: 'results', groups: EMPTY_GROUPS });
    return;
  }

  const config = vscode.workspace.getConfiguration('vsSearch');
  const limit = config.get<number>('maxResults', 30);
  const types = parseTypes(current.types);
  const scope = validScope(current.scope);

  post(current, { type: 'busy', value: true });

  const groups = await searchAll(query, limit, scope, types);
  if (current.disposed || generation !== current.generation) {
    return;
  }

  current.groups = groups;
  post(current, { type: 'results', groups });
}

async function accept(
  current: SearchSession,
  item: ResultItem | undefined,
  alt: boolean
): Promise<void> {
  if (!item) {
    return;
  }

  if (alt) {
    await openNativeSearch(current.query.trim() || item.label, {
      filesToInclude: scopeGlob(current.scope, parseTypes(current.types)),
    });
    return;
  }

  if (item.kind === 'action' || item.kind === 'command') {
    if (!item.command) {
      return;
    }
    if (item.command === 'workbench.action.quickOpen') {
      await vscode.commands.executeCommand('workbench.action.quickOpen', '>');
    } else {
      await vscode.commands.executeCommand(item.command);
    }
    return;
  }

  if (!item.uri) {
    return;
  }

  // The page stays open; the file opens in the primary editor beside it.
  const uri = vscode.Uri.parse(item.uri);
  if (item.kind === 'file') {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preview: true,
    });
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(
    Math.max(0, (item.line ?? 1) - 1),
    Math.max(0, (item.column ?? 1) - 1)
  );
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preview: true,
    selection: new vscode.Range(position, position),
  });
}

/** Scope must be a real folder inside the workspace, otherwise ignore it. */
function validScope(scope: string): string | undefined {
  if (!scope) {
    return undefined;
  }
  try {
    const stat = fs.statSync(scope);
    return stat.isDirectory() ? scope : undefined;
  } catch {
    return undefined;
  }
}

function scopeGlob(scope: string, types: string[]): string {
  const prefix = scope ? `${scope}/` : '';
  if (!types.length) {
    return `${prefix}**`;
  }
  const extGlob = types.length === 1 ? `*.${types[0]}` : `*.{${types.join(',')}}`;
  return `${prefix}**/${extGlob}`;
}

function dispose(current: SearchSession): void {
  if (current.disposed) {
    return;
  }
  current.disposed = true;
  current.panel.dispose();
  if (session === current) {
    session = undefined;
  }
}

function post(current: SearchSession, message: unknown): void {
  if (current.disposed) {
    return;
  }
  void current.panel.webview.postMessage(message);
}

function theme(): string {
  return vscode.workspace.getConfiguration('vsSearch').get<string>('theme', 'phpstorm');
}

function folders(): Array<{ name: string; path: string }> {
  const list: Array<{ name: string; path: string }> = [];
  for (const root of vscode.workspace.workspaceFolders ?? []) {
    list.push({ name: root.name, path: root.uri.fsPath });
    list.push(...subfolders(root.uri.fsPath, root.name));
  }
  return list;
}

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'target',
  'coverage',
  '.next',
  '.nuxt',
]);

/** Direct subfolders of a root, labelled relative to the workspace. */
function subfolders(dir: string, label: string): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (result.length >= 40) {
        break;
      }
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) {
        continue;
      }
      result.push({
        name: `${label}/${entry.name}`,
        path: path.join(dir, entry.name),
      });
    }
  } catch {
    // unreadable root
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function pickFolder(current: SearchSession): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Set search scope',
    defaultUri: current.scope ? vscode.Uri.file(current.scope) : undefined,
  });

  const scope = picked?.[0]?.fsPath ?? current.scope;
  post(current, { type: 'folders', folders: folders(), scope });
}

function initMessage(options: PageOptions): Record<string, unknown> {
  return {
    type: 'init',
    theme: theme(),
    mode: 'page',
    initial: options.initial ?? '',
    tab: options.tab ?? 'all',
    scope: options.scope ?? '',
    folders: folders(),
  };
}

function buildHtml(webview: vscode.Webview, mediaRoot: vscode.Uri, palette: string): string {
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'overlay.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'overlay.js'));
  const nonce = createNonce();

  return template()
    .replace(
      '{{cspMeta}}',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />`
    )
    .replace('{{styleHref}}', styleUri.toString())
    .replace('{{scriptTag}}', `<script nonce="${nonce}" src="${scriptUri}"></script>`)
    .replace(/\{\{theme\}\}/g, palette)
    .replace(/\{\{mode\}\}/g, 'page');
}

let templateCache: string | undefined;

function template(): string {
  if (!templateCache) {
    templateCache = fs.readFileSync(path.join(__dirname, '..', 'media', 'overlay.html'), 'utf8');
  }
  return templateCache;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
