import * as vscode from 'vscode';

export interface OpenSearchEditorArgs {
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

/**
 * Hand a query to VS Code's own search UI: the Search Editor (editor area) and,
 * if that is unavailable, the built-in "find in files" sidebar view.
 */
export async function openNativeSearch(
  query: string,
  options: {
    toSide?: boolean;
    config?: vscode.WorkspaceConfiguration;
    filesToInclude?: string;
  } = {}
): Promise<void> {
  const config = options.config ?? vscode.workspace.getConfiguration('scanline');
  const target = config.get<string>('target', 'searchEditor');

  if (target === 'searchEditor') {
    const reuse = config.get<boolean>('reuseSearchEditor', true);
    const command = options.toSide
      ? 'search.action.openNewEditorToSide'
      : reuse
        ? 'search.action.openEditor'
        : 'search.action.openNewEditor';

    const args: OpenSearchEditorArgs = {
      query,
      triggerSearch: true,
      focusResults: false,
      showIncludesExcludes: config.get<boolean>('showIncludesExcludes', false),
      ...(options.filesToInclude ? { filesToInclude: options.filesToInclude } : {}),
    };

    try {
      await vscode.commands.executeCommand(command, args);
      return;
    } catch {
      // Older builds may not expose the Search Editor commands.
    }
  }

  await vscode.commands.executeCommand('workbench.action.findInFiles', {
    query,
    triggerSearch: true,
    preserveCase: false,
  });
}
