import * as vscode from 'vscode';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';

export type TabId = 'all' | 'files' | 'text' | 'symbols' | 'actions';
export type ResultKind = 'file' | 'text' | 'symbol' | 'action' | 'command';

export interface ResultItem {
  kind: ResultKind;
  /** Main text of the row (file name, code line, symbol name, ...). */
  label: string;
  /** Right aligned dim text (path, container, ...). */
  detail?: string;
  uri?: string;
  line?: number;
  column?: number;
  command?: string;
  /** Highlight ranges inside `label`. */
  match?: Array<[number, number]>;
  score: number;
}

export type ResultGroups = Record<Exclude<TabId, 'all'>, ResultItem[]>;

const MAX_PER_TEXT_FILE = 3;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

let currentRg: ChildProcessWithoutNullStreams | undefined;
let rgAvailable: boolean | undefined;

/** Kill any in-flight ripgrep process (called on every new keystroke). */
function isRipgrepUnavailable(): boolean {
  return rgAvailable === false;
}

export function cancelTextSearch(): void {
  if (currentRg) {
    currentRg.kill();
    currentRg = undefined;
  }
}

export async function searchAll(
  query: string,
  limit: number,
  scope?: string,
  types: string[] = []
): Promise<ResultGroups> {
  const [files, text, symbols, actions] = await Promise.all([
    searchFiles(query, limit, scope, types).catch(() => []),
    searchText(query, limit, scope, types).catch(() => []),
    searchSymbols(query, limit, scope, types).catch(() => []),
    searchActions(query, limit).catch(() => []),
  ]);
  return { files, text, symbols, actions };
}

/** "ts, js, *.md" -> ["ts", "js", "md"] */
export function parseTypes(input: string): string[] {
  return (input || '')
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase().replace(/^\*?\./, ''))
    .filter((part) => part.length > 0 && /^[a-z0-9_+-]+$/i.test(part));
}

function typeGlob(types: string[]): string {
  return types.length === 1 ? `*.${types[0]}` : `*.{${types.join(',')}}`;
}

function matchesType(fsPath: string, types: string[]): boolean {
  if (!types.length) {
    return true;
  }
  const ext = path.extname(fsPath).slice(1).toLowerCase();
  return types.includes(ext);
}

/* ------------------------------------------------------------------ files */

export async function searchFiles(
  query: string,
  limit: number,
  scope?: string,
  types: string[] = []
): Promise<ResultItem[]> {
  if (!query.trim()) {
    return [];
  }

  const cleaned = query.replace(/[\\*?[\]{}()!]/g, '');
  if (!cleaned) {
    return [];
  }

  // Use the longest token for the glob, then fuzzy-rank against the whole query.
  const token =
    cleaned
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] ?? cleaned;

  const pattern = types.length ? `**/${typeGlob(types)}` : `**/*${token}*`;
  const uris = await vscode.workspace.findFiles(
    scope ? new vscode.RelativePattern(vscode.Uri.file(scope), pattern) : pattern,
    '**/{node_modules,.git,dist,out,build,target}/**',
    Math.max(limit * 6, 300)
  );

  return uris
    .map((uri) => {
      const name = path.basename(uri.fsPath);
      return {
        uri: uri.toString(),
        name,
        detail: vscode.workspace.asRelativePath(uri, false).replace(/[\\/][^\\/]*$/, ''),
        score: fuzzyScore(name, cleaned.replace(/\s+/g, '')) || fuzzyScore(name, token),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      kind: 'file' as const,
      label: entry.name,
      detail: entry.detail,
      uri: entry.uri,
      score: entry.score,
    }));
}

/* ------------------------------------------------------------------- text */

export async function searchText(
  query: string,
  limit: number,
  scope?: string,
  types: string[] = []
): Promise<ResultItem[]> {
  if (query.trim().length < 2) {
    return [];
  }

  if (isRipgrepUnavailable()) {
    return searchTextFallback(query, limit, scope, types);
  }

  const folders = scope
    ? [scope]
    : (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  if (!folders.length) {
    return [];
  }

  const results: ResultItem[] = [];
  for (const folder of folders) {
    if (results.length >= limit) {
      break;
    }
    const chunk = await ripgrep(folder, query, limit - results.length, types).catch(
      (error: NodeJS.ErrnoException) => {
        if (error?.code === 'ENOENT') {
          rgAvailable = false;
        }
        return [] as ResultItem[];
      }
    );
    results.push(...chunk);
  }

  if (isRipgrepUnavailable()) {
    return searchTextFallback(query, limit, scope, types);
  }

  return results.slice(0, limit);
}

function ripgrep(cwd: string, query: string, limit: number, types: string[]): Promise<ResultItem[]> {
  return new Promise<ResultItem[]>((resolve, reject) => {
    const args = [
      '--json',
      '--no-heading',
      '--line-number',
      '--smart-case',
      '--fixed-strings',
      '--max-count',
      String(MAX_PER_TEXT_FILE),
      '--max-columns',
      '300',
      '--max-filesize',
      '2M',
      '--glob',
      '!**/node_modules/**',
      '--glob',
      '!**/.git/**',
      ...types.flatMap((type) => ['--glob', `*.${type}`]),
      '--',
      query,
      '.',
    ];

    const child: ChildProcessWithoutNullStreams = spawn('rg', args, { cwd });
    currentRg = child;
    const found: ResultItem[] = [];
    let buffer = '';
    let settled = false;

    const done = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      if (error) {
        reject(error);
      } else {
        resolve(found);
      }
    };

    child.on('error', (error) => done(error));

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim() || found.length >= limit) {
          continue;
        }
        const item = parseRgLine(line, cwd);
        if (item) {
          found.push(item);
        }
      }
      if (found.length >= limit) {
        done();
      }
    });

    child.on('close', () => done());
  });
}

function parseRgLine(line: string, cwd: string): ResultItem | undefined {
  let parsed: {
    type?: string;
    data?: {
      path?: { text?: string };
      line_number?: number;
      lines?: { text?: string };
      submatches?: Array<{ start?: number; end?: number; match?: { text?: string } }>;
    };
  };

  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (parsed.type !== 'match' || !parsed.data?.path?.text) {
    return undefined;
  }

  const rawLine = (parsed.data.lines?.text ?? '').replace(/\r?\n$/, '');
  const trimmedStart = rawLine.length - rawLine.trimStart().length;
  const text = rawLine.trim();
  if (!text) {
    return undefined;
  }

  const needle = parsed.data.submatches?.[0]?.match?.text;
  const match: Array<[number, number]> = [];
  if (needle) {
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index >= 0) {
      match.push([index, index + needle.length]);
    }
  }

  const relative = parsed.data.path.text.replace(/^\.\//, '');
  // rg prints paths relative to its cwd; make them absolute before wrapping.
  const uri = vscode.Uri.file(path.isAbsolute(relative) ? relative : path.join(cwd, relative));
  return {
    kind: 'text',
    label: text.length > 240 ? text.slice(0, 240) : text,
    detail: `${vscode.workspace.asRelativePath(uri, false)}:${parsed.data.line_number ?? 1}`,
    uri: uri.toString(),
    line: parsed.data.line_number ?? 1,
    column: Math.max(1, trimmedStart + 1),
    match,
    score: 1,
  };
}

/** Used when `rg` is not on PATH. Same VS Code file API, no external binary. */
async function searchTextFallback(
  query: string,
  limit: number,
  scope?: string,
  types: string[] = []
): Promise<ResultItem[]> {
  const pattern = types.length ? `**/${typeGlob(types)}` : '**/*';
  const files = await vscode.workspace.findFiles(
    scope ? new vscode.RelativePattern(vscode.Uri.file(scope), pattern) : pattern,
    '**/{node_modules,.git,dist,out,build,target,coverage}/**',
    1500
  );
  const needle = query.toLowerCase();
  const results: ResultItem[] = [];

  for (const uri of files) {
    if (results.length >= limit) {
      break;
    }
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_BYTES) {
        continue;
      }
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      if (content.includes('\u0000')) {
        continue;
      }
      const lines = content.split(/\r?\n/);
      let perFile = 0;
      for (let index = 0; index < lines.length && perFile < MAX_PER_TEXT_FILE; index++) {
        const column = lines[index].toLowerCase().indexOf(needle);
        if (column >= 0) {
          perFile++;
          const raw = lines[index];
          const trimmedStart = raw.length - raw.trimStart().length;
          const text = raw.trim();
          results.push({
            kind: 'text',
            label: text.length > 240 ? text.slice(0, 240) : text,
            detail: `${vscode.workspace.asRelativePath(uri, false)}:${index + 1}`,
            uri: uri.toString(),
            line: index + 1,
            column: Math.max(1, column - trimmedStart + 1),
            match: [[Math.max(0, column - trimmedStart), Math.max(0, column - trimmedStart) + needle.length]],
            score: 1,
          });
          if (results.length >= limit) {
            break;
          }
        }
      }
    } catch {
      // unreadable / binary
    }
  }

  return results;
}

/* ---------------------------------------------------------------- symbols */

export async function searchSymbols(
  query: string,
  limit: number,
  scope?: string,
  types: string[] = []
): Promise<ResultItem[]> {
  if (!query.trim()) {
    return [];
  }

  const symbols =
    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query
    )) ?? [];

  const scopePrefix = scope ? `${scope.replace(/[\\/]$/, '')}${path.sep}` : '';

  return symbols
    .filter((symbol) => symbol?.location?.uri)
    .filter((symbol) => !scopePrefix || symbol.location.uri.fsPath.startsWith(scopePrefix))
    .filter((symbol) => matchesType(symbol.location.uri.fsPath, types))
    .map((symbol) => ({
      symbol,
      score:
        fuzzyScore(symbol.name, query.replace(/\s+/g, '')) || fuzzyScore(symbol.name, query) || 1,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ symbol, score }) => {
      const uri = symbol.location.uri;
      return {
        kind: 'symbol' as const,
        label: symbol.name,
        detail: `${symbol.containerName ? `${symbol.containerName} · ` : ''}${vscode.workspace.asRelativePath(uri, false)}:${symbol.location.range.start.line + 1}`,
        uri: uri.toString(),
        line: symbol.location.range.start.line + 1,
        column: symbol.location.range.start.character + 1,
        score,
      };
    });
}

/* ---------------------------------------------------------------- actions */

export async function searchActions(query: string, limit: number): Promise<ResultItem[]> {
  const all = await vscode.commands.getCommands(true);
  const cleaned = query.trim().toLowerCase();

  const candidates = all
    .filter((id) => !id.startsWith('_') && !id.startsWith('scanline.'))
    .map((id) => {
      const title = prettifyCommand(id);
      return { id, title, score: Math.max(fuzzyScore(id, cleaned), fuzzyScore(title, cleaned)) };
    });

  const matches = cleaned
    ? candidates.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score)
    : [];

  return matches.slice(0, limit).map((entry) => ({
    kind: 'action' as const,
    label: entry.title,
    detail: entry.id,
    command: entry.id,
    score: entry.score,
  }));
}

function prettifyCommand(id: string): string {
  return id
    .replace(/^workbench\.action\./, '')
    .replace(/^editor\.action\./, '')
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

/* ------------------------------------------------------------ fuzzy score */

/** Subsequence score: 0 = no match, higher = better. */
export function fuzzyScore(candidate: string, query: string): number {
  const needle = query.toLowerCase();
  if (!needle) {
    return 0;
  }
  const haystack = candidate.toLowerCase();
  if (haystack === needle) {
    return 1000;
  }

  let score = 0;
  let haystackIndex = 0;
  let streak = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, haystackIndex);
    if (found === -1) {
      return 0;
    }
    streak = found === haystackIndex ? streak + 1 : 0;
    const isBoundary = found === 0 || /[^a-zA-Z0-9]/.test(haystack[found - 1]);
    score += 10 + streak * 6 + (isBoundary ? 14 : 0);
    haystackIndex = found + 1;
  }

  // Prefer basename hits over deep paths.
  score -= Math.max(0, candidate.length - needle.length) * 0.2;
  if (haystack.startsWith(needle)) {
    score += 120;
  }
  return score;
}
