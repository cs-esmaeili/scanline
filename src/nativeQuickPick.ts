import * as vscode from 'vscode';
import { openNativeSearch } from './native';
import { cancelTextSearch, searchAll, type ResultGroups, type ResultItem } from './search';

/**
 * Tab-less search: a native QuickPick that floats over the window wherever the
 * user is. No editor tab is created, no webview, no layout change.
 *
 * Results come from the same providers as the webview overlay; QuickPick is
 * only the renderer.
 */

interface Entry extends vscode.QuickPickItem {
  item?: ResultItem;
  alwaysShow?: boolean;
}

export interface QuickSearchOptions {
  initial?: string;
}

export function openQuickSearch(
  context: vscode.ExtensionContext,
  options: QuickSearchOptions = {}
): vscode.QuickPick<Entry> {
  const config = vscode.workspace.getConfiguration('vsSearch');
  const limit = Math.min(Math.max(config.get<number>('maxResults', 30), 5), 15);

  const picker = vscode.window.createQuickPick<Entry>();
  picker.title = config.get<string>('title', 'Search Everywhere');
  picker.placeholder = 'Search everywhere — files, text, symbols and commands';
  picker.ignoreFocusOut = false;
  picker.matchOnDescription = true;
  picker.matchOnDetail = false;
  picker.value = options.initial ?? '';

  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async (): Promise<void> => {
    const query = picker.value;
    const current = ++generation;
    cancelTextSearch();

    if (!query.trim()) {
      picker.busy = false;
      picker.items = [
        {
          label: 'Type to search files, text, symbols and commands',
          kind: vscode.QuickPickItemKind.Separator,
        },
      ];
      return;
    }

    picker.busy = true;
    const groups = await searchAll(query, limit);
    if (current !== generation) {
      return;
    }

    picker.busy = false;
    picker.items = buildItems(groups);
    const first = picker.items.find((entry) => entry.item);
    if (first) {
      picker.activeItems = [first];
    }
  };

  picker.onDidChangeValue(() => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void run();
    }, 90);
  });

  picker.onDidAccept(() => {
    const entry = picker.activeItems.find((candidate) => candidate.item);
    if (!entry?.item) {
      // Nothing selected: fall back to VS Code's own search editor.
      const query = picker.value.trim();
      picker.hide();
      if (query) {
        void openNativeSearch(query, { config });
      }
      return;
    }
    const item = entry.item;
    picker.hide();
    void openResult(item);
  });

  picker.onDidHide(() => {
    if (timer) {
      clearTimeout(timer);
    }
    cancelTextSearch();
    picker.dispose();
  });

  picker.show();
  if (picker.value.trim()) {
    void run();
  }

  return picker;
}

function iconFor(item: ResultItem): vscode.ThemeIcon {
  switch (item.kind) {
    case 'file':
      return new vscode.ThemeIcon('file');
    case 'text':
      return new vscode.ThemeIcon('symbol-text');
    case 'symbol':
      return new vscode.ThemeIcon('symbol-method');
    case 'command':
      return new vscode.ThemeIcon('search');
    default:
      return new vscode.ThemeIcon('play');
  }
}

function buildItems(groups: ResultGroups): Entry[] {
  const items: Entry[] = [];

  const section = (title: string, list: ResultItem[]): void => {
    if (!list.length) {
      return;
    }
    items.push({ label: title, kind: vscode.QuickPickItemKind.Separator });
    for (const item of list) {
      items.push({
        label: item.label,
        description: item.detail,
        iconPath: iconFor(item),
        // Results are already filtered by the providers; VS Code's own
        // substring filter would drop valid rows on multi-word queries.
        alwaysShow: true,
        item,
      });
    }
  };

  section('Files', groups.files);
  section('Text occurrences', groups.text);
  section('Symbols', groups.symbols);
  section('Commands', groups.actions);

  if (!items.length) {
    items.push({
      label: 'No results',
      description: 'Enter searches with the native Search Editor',
      alwaysShow: true,
    });
  }

  return items;
}

async function openResult(item: ResultItem): Promise<void> {
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
