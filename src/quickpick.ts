import * as vscode from 'vscode';
import { openNativeSearch } from './native';

const HISTORY_KEY = 'vsSearch.history';

interface HistoryItem extends vscode.QuickPickItem {
  label: string;
}

export interface QuickSearchOptions {
  initial?: string;
  toSide?: boolean;
}

/** Native centered QuickPick → native search. */
export async function openQuickSearch(
  context: vscode.ExtensionContext,
  options: QuickSearchOptions = {}
): Promise<void> {
  const config = vscode.workspace.getConfiguration('vsSearch');
  const query = await askQuery(context, config, options.initial ?? '');
  if (query === undefined) {
    return;
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return;
  }

  await remember(context, trimmed, config);
  await openNativeSearch(trimmed, { toSide: options.toSide, config });
}

export async function clearQuickSearchHistory(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(HISTORY_KEY, []);
  void vscode.window.showInformationMessage('Search overlay history cleared.');
}

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
      const value = picker.value.length > 0 ? picker.value : (active?.label ?? '');
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
