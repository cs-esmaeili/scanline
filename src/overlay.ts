import * as vscode from 'vscode';
import {
  cancelTextSearch,
  searchAll,
  type ResultGroups,
  type ResultItem,
  type TabId,
} from './search';

interface OverlaySession {
  panel: vscode.WebviewPanel;
  context: vscode.ExtensionContext;
  groups: ResultGroups;
  query: string;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  disposed: boolean;
}

let session: OverlaySession | undefined;

const SEARCH_ICON =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="4.3"/>' +
  '<path d="M10.3 10.3L14 14"/></svg>';

const EMPTY_GROUPS: ResultGroups = { files: [], text: [], symbols: [], actions: [] };

export interface OverlayOptions {
  initial?: string;
  tab?: TabId;
}

export function showOverlay(context: vscode.ExtensionContext, options: OverlayOptions = {}): void {
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
    'Search',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    }
  );
  panel.title = 'Search';

  const current: OverlaySession = {
    panel,
    context,
    groups: EMPTY_GROUPS,
    query: '',
    generation: 0,
    disposed: false,
  };
  session = current;

  panel.webview.html = buildHtml(panel.webview, mediaRoot, theme());

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

  // Behaves like a modal: leaving the tab closes it.
  let hasBeenVisible = false;
  panel.onDidChangeViewState((event) => {
    if (event.webviewPanel.visible) {
      hasBeenVisible = true;
    } else if (hasBeenVisible) {
      dispose(current);
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

function buildHtml(webview: vscode.Webview, mediaRoot: vscode.Uri, palette: string): string {
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'overlay.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'overlay.js'));
  const nonce = createNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${styleUri}" />
<title>Search</title>
</head>
<body data-theme="${palette}">
  <div class="backdrop">
    <div class="dialog" role="dialog" aria-label="Search everywhere">
      <div class="input-row">
        <span class="search-icon">${SEARCH_ICON}</span>
        <input id="query" type="text" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Search everywhere" />
        <span class="spinner" id="spinner"></span>
        <span class="esc">Esc</span>
      </div>
      <div class="tabs" id="tabs"></div>
      <div class="results" id="results"></div>
      <div class="footer">
        <div class="hints">&#8593;&#8595; navigate &middot; Enter open &middot; Alt+Enter in Search Editor &middot; Tab switch tab &middot; Esc close</div>
        <div class="stats" id="stats"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
