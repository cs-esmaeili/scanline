import * as vscode from 'vscode';

/**
 * Search Overlay
 *
 * Goal: give VS Code a PhpStorm-style "search everywhere" popup in the middle of
 * the screen without re-implementing any search logic.
 *
 * How:
 *  1. A native QuickPick (rendered centered at the top of the window by VS Code
 *     itself) collects the query. Recent queries are offered as a history list.
 *  2. On submit we hand the query to VS Code's own search: the Search Editor
 *     (`search.action.openEditor` / `search.action.openNewEditor`), which opens
 *     in the editor area instead of the left sidebar.
 *
 * Native toggles (match case, whole word, regex, include/exclude globs) stay
 * inside the Search Editor UI, so nothing about searching is re-implemented here.
 */

const HISTORY_KEY = 'vsSearch.history';

interface OpenSearchEditorArgs {
  query?: string;
  filesToInclude?: string;
  filesToExclude?: string;
  contextLines?: number;
  matchWholeWord?: boolean;
  isCaseSensitive?: boolean;
  isRegexp?: boolean;
  useExcludeSettingsAndIgnoreFiles?: boolean;
  showIncludesExcludes?: boolean;
  triggerSearch?: boolean;
  focusResults?: boolean;
  onlyOpenEditors?: boolean;
}

interface OverlayOptions {
  toSide?: boolean;
  useSelection?: boolean;
}

type Target = 'searchEditor' | 'sidebarPanel';

interface HistoryItem extends vscode.QuickPickItem {
  label: string;
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vsSearch.search', () => openOverlay(context, {})),
    vscode.commands.registerCommand('vsSearch.searchToSide', () =>
      openOverlay(context, { toSide: true })
    ),
    vscode.commands.registerCommand('vsSearch.searchSelection', () =>
      openOverlay(context, { useSelection: true })
    ),
    vscode.commands.registerCommand('vsSearch.clearHistory', async () => {
      await context.globalState.update(HISTORY_KEY, []);
      void vscode.window.showInformationMessage('Search overlay history cleared.');
    })
  );
}

export function deactivate(): void {
  // nothing to dispose
}

async function openOverlay(
  context: vscode.ExtensionContext,
  options: OverlayOptions
): Promise<void> {
  const config = vscode.workspace.getConfiguration('vsSearch');
  const initial = options.useSelection ? selectedText() : '';

  const query = await askQuery(context, config, initial);
  if (query === undefined) {
    return;
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return;
  }

  await remember(context, trimmed, config);
  await runNativeSearch(trimmed, options.toSide === true, config);
}

/** Centered input. Native QuickPick, no custom search behind it. */
function askQuery(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration,
  initial: string
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    const picker = vscode.window.createQuickPick<HistoryItem>();
    picker.title = config.get<string>('title', 'Search Everywhere');
    picker.placeholder = 'Type to search the workspace — Enter runs VS Code search';
    picker.ignoreFocusOut = true;
    picker.matchOnDescription = false;
    picker.matchOnDetail = false;
    picker.items = historyItems(context, config);
    picker.value = initial;

    let settled = false;
    const finish = (value?: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      picker.hide();
      picker.dispose();
      resolve(value);
    };

    picker.onDidAccept(() => {
      const active = picker.activeItems[0];
      // Typed text wins over the highlighted history entry.
      const value = picker.value.length > 0 ? picker.value : active?.label ?? '';
      if (!value.trim()) {
        return;
      }
      finish(value);
    });
    picker.onDidHide(() => finish(undefined));

    picker.show();
  });
}

function historyItems(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration
): HistoryItem[] {
  const limit = Math.max(0, config.get<number>('historyLimit', 25));
  const history = context.globalState.get<string[]>(HISTORY_KEY, []).slice(0, limit);
  return history.map((query) => ({
    label: query,
    iconPath: new vscode.ThemeIcon('history'),
  }));
}

async function remember(
  context: vscode.ExtensionContext,
  query: string,
  config: vscode.WorkspaceConfiguration
): Promise<void> {
  const limit = Math.max(0, config.get<number>('historyLimit', 25));
  if (limit === 0) {
    return;
  }
  const history = context.globalState.get<string[]>(HISTORY_KEY, []);
  const next = [query, ...history.filter((entry) => entry !== query)].slice(0, limit);
  await context.globalState.update(HISTORY_KEY, next);
}

/** Hand the query to VS Code's own search. Zero search logic here. */
async function runNativeSearch(
  query: string,
  toSide: boolean,
  config: vscode.WorkspaceConfiguration
): Promise<void> {
  const target = config.get<Target>('target', 'searchEditor');

  if (target === 'searchEditor') {
    const reuse = config.get<boolean>('reuseSearchEditor', true);
    const command = toSide
      ? 'search.action.openNewEditorToSide'
      : reuse
        ? 'search.action.openEditor'
        : 'search.action.openNewEditor';

    const args: OpenSearchEditorArgs = {
      query,
      triggerSearch: true,
      focusResults: false,
      showIncludesExcludes: config.get<boolean>('showIncludesExcludes', false),
    };

    try {
      await vscode.commands.executeCommand(command, args);
      return;
    } catch {
      // Older builds may not expose the Search Editor commands.
    }
  }

  // Fallback: the built-in "find in files" (left sidebar), still native search.
  await vscode.commands.executeCommand('workbench.action.findInFiles', {
    query,
    triggerSearch: true,
    preserveCase: false,
  });
}

function selectedText(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return '';
  }
  for (const selection of editor.selections) {
    const text = editor.document.getText(selection);
    if (text.trim()) {
      // The Search Editor query field is single-line.
      return text.split(/\r?\n/)[0].trim();
    }
  }
  return '';
}
