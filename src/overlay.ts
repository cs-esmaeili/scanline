import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  cancelTextSearch,
  searchAll,
  type ResultGroups,
  type ResultItem,
  type TabId,
} from './search';

export type Presentation = 'overlay' | 'page';

interface OverlaySession {
  panel: vscode.WebviewPanel;
  context: vscode.ExtensionContext;
  groups: ResultGroups;
  query: string;
  generation: number;
  mode: Presentation;
  timer?: ReturnType<typeof setTimeout>;
  disposed: boolean;
}

let session: OverlaySession | undefined;

const SEARCH_ICON =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="4.3"/>' +
  '<path d="M10.3 10.3L14 14"/></svg>';

const CLOSE_ICON =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

const EMPTY_GROUPS: ResultGroups = { files: [], text: [], symbols: [], actions: [] };

export interface OverlayOptions {
  initial?: string;
  tab?: TabId;
  mode?: Presentation;
}

export function showOverlay(context: vscode.ExtensionContext, options: OverlayOptions = {}): void {
  const mode = options.mode ?? presentation();

  // A different presentation needs a fresh panel; a "page" must not turn into
  // a modal behind the user's back and vice versa.
  if (session && !session.disposed && session.mode !== mode) {
    dispose(session);
  }

  if (session && !session.disposed) {
    session.panel.reveal(undefined, false);
    post(session, { type: 'focus' });
    if (options.initial) {
      post(session, { type: 'init', theme: theme(), initial: options.initial, tab: options.tab ?? 'all' });
    }
    return;
  }

  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel(
    'vsSearch.overlay',
    mode === 'page' ? 'Search Everywhere' : 'Search',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    }
  );
  panel.title = mode === 'page' ? 'Search Everywhere' : 'Search';

  const current: OverlaySession = {
    panel,
    context,
    groups: EMPTY_GROUPS,
    query: '',
    generation: 0,
    mode,
    disposed: false,
  };
  session = current;

  panel.webview.html = buildHtml(panel.webview, mediaRoot, theme(), mode);

  panel.webview.onDidReceiveMessage(
    (message: { type?: string; value?: string; item?: ResultItem; alt?: boolean; tab?: TabId }) => {
      if (!message?.type) {
        return;
      }
      switch (message.type) {
        case 'ready':
          post(current, {
            type: 'init',
            theme: theme(),
            initial: options.initial ?? '',
            tab: options.tab ?? 'all',
          });
          break;
        case 'query':
          schedule(current, message.value ?? '');
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

  // Modal only in overlay mode: leaving the tab closes it. In page mode the
  // webview is a normal editor tab and stays put.
  let hasBeenVisible = false;
  if (mode === 'overlay') {
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) {
        hasBeenVisible = true;
      } else if (hasBeenVisible) {
        dispose(current);
      }
    });
  } else {
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) {
        post(current, { type: 'focus' });
      }
    });
  }

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

export function closeOverlay(): void {
  if (session) {
    dispose(session);
  }
}

function schedule(current: OverlaySession, query: string): void {
  current.query = query;
  cancelTextSearch();
  if (current.timer) {
    clearTimeout(current.timer);
  }
  current.timer = setTimeout(() => {
    void run(current);
  }, 70);
}

async function run(current: OverlaySession): Promise<void> {
  const query = current.query;
  const generation = ++current.generation;

  if (!query.trim()) {
    current.groups = EMPTY_GROUPS;
    post(current, { type: 'results', groups: EMPTY_GROUPS });
    return;
  }

  const limit = vscode.workspace.getConfiguration('vsSearch').get<number>('maxResults', 30);
  post(current, { type: 'busy', value: true });

  const groups = await searchAll(query, limit);
  if (current.disposed || generation !== current.generation) {
    return;
  }

  current.groups = groups;
  post(current, { type: 'results', groups });
}

async function accept(
  current: OverlaySession,
  item: ResultItem | undefined,
  alt: boolean
): Promise<void> {
  if (!item) {
    return;
  }

  if (alt) {
    const query = current.query.trim() || item.label;
    dispose(current);
    await vscode.commands.executeCommand('search.action.openEditor', {
      query,
      triggerSearch: true,
    });
    return;
  }

  if (item.kind === 'action' || item.kind === 'command') {
    dispose(current);
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

  dispose(current);

  const uri = vscode.Uri.parse(item.uri);
  if (item.kind === 'file') {
    await vscode.commands.executeCommand('vscode.open', uri);
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(
    Math.max(0, (item.line ?? 1) - 1),
    Math.max(0, (item.column ?? 1) - 1)
  );
  await vscode.window.showTextDocument(document, {
    preview: true,
    selection: new vscode.Range(position, position),
  });
}

function dispose(current: OverlaySession): void {
  if (current.disposed) {
    return;
  }
  current.disposed = true;
  current.panel.dispose();
  if (session === current) {
    session = undefined;
  }
}

function post(current: OverlaySession, message: unknown): void {
  if (current.disposed) {
    return;
  }
  void current.panel.webview.postMessage(message);
}

function theme(): string {
  return vscode.workspace.getConfiguration('vsSearch').get<string>('theme', 'phpstorm');
}

function presentation(): Presentation {
  return vscode.workspace.getConfiguration('vsSearch').get<Presentation>('presentation', 'overlay');
}

function buildHtml(
  webview: vscode.Webview,
  mediaRoot: vscode.Uri,
  palette: string,
  mode: Presentation | 'desktop'
): string {
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
    .replace(/\{\{theme\}\}/g, String(palette))
    .replace(/\{\{mode\}\}/g, String(mode));
}

let templateCache: string | undefined;

/** Shared between the VS Code webview and the standalone desktop overlay. */
function template(): string {
  if (!templateCache) {
    const folder = vscode.Uri.joinPath(extensionRoot(), 'media', 'overlay.html');
    templateCache = fs.readFileSync(folder.fsPath, 'utf8');
  }
  return templateCache;
}

function extensionRoot(): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..'));
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
