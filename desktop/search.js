// Plain-node search providers for the standalone overlay.
// Same engine as the VS Code extension: ripgrep, no custom indexing.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EMPTY_GROUPS = { files: [], text: [], symbols: [], actions: [] };
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const fileCache = new Map();
let runningRg;

/** "ts, js, *.md" -> ["ts", "js", "md"] */
function parseTypes(input) {
  return String(input || '')
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase().replace(/^\*?\./, ''))
    .filter((part) => part.length > 0 && /^[a-z0-9_+-]+$/i.test(part));
}

function typeGlob(types) {
  return types.length === 1 ? `*.${types[0]}` : `*.{${types.join(',')}}`;
}

function matchesType(filePath, types) {
  if (!types.length) {
    return true;
  }
  return types.includes(path.extname(filePath).slice(1).toLowerCase());
}

function configPath() {
  return path.join(os.homedir(), '.config', 'scanline', 'workspace.json');
}

function workspaceRoots() {
  try {
    const data = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (Array.isArray(data.roots) && data.roots.length) {
      const existing = data.roots.filter((root) => {
        try {
          return fs.statSync(root).isDirectory();
        } catch {
          return false;
        }
      });
      if (existing.length) {
        return existing;
      }
    }
  } catch {
    // no workspace file yet
  }
  return [process.env.VS_SEARCH_ROOT || os.homedir()];
}

function cancel() {
  if (runningRg) {
    runningRg.kill();
    runningRg = undefined;
  }
}

function fuzzyScore(candidate, query) {
  const needle = String(query).toLowerCase();
  if (!needle) {
    return 0;
  }
  const haystack = candidate.toLowerCase();
  if (haystack === needle) {
    return 1000;
  }
  let score = 0;
  let index = 0;
  let streak = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, index);
    if (found === -1) {
      return 0;
    }
    streak = found === index ? streak + 1 : 0;
    const boundary = found === 0 || /[^a-zA-Z0-9]/.test(haystack[found - 1]);
    score += 10 + streak * 6 + (boundary ? 14 : 0);
    index = found + 1;
  }
  score -= Math.max(0, candidate.length - needle.length) * 0.2;
  if (haystack.startsWith(needle)) {
    score += 120;
  }
  return score;
}

function listFiles(root) {
  const cached = fileCache.get(root);
  if (cached && Date.now() - cached.time < 4000) {
    return Promise.resolve(cached.files);
  }
  return new Promise((resolve) => {
    const child = spawn(
      'rg',
      ['--files', '--glob', '!**/node_modules/**', '--glob', '!**/.git/**', '.'],
      { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (out.length < 8_000_000) {
        out += chunk;
      }
    });
    const finish = () => {
      const files = out
        .split('\n')
        .map((line) => line.replace(/^\.\//, ''))
        .filter(Boolean);
      fileCache.set(root, { time: Date.now(), files });
      resolve(files);
    };
    child.on('error', () => resolve([]));
    child.on('close', finish);
  });
}

async function searchFiles(query, limit, scope, types) {
  const roots = scope ? [scope] : workspaceRoots();
  const needle = query.trim().replace(/\s+/g, '');
  if (!needle) {
    return [];
  }
  const scored = [];
  for (const root of roots) {
    const files = await listFiles(root);
    for (const relative of files) {
      if (!matchesType(relative, types)) {
        continue;
      }
      const name = path.basename(relative);
      const score = fuzzyScore(name, needle);
      if (score > 0) {
        scored.push({ root, relative, name, score });
      }
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      kind: 'file',
      label: entry.name,
      detail: path.dirname(entry.relative) === '.' ? '' : path.dirname(entry.relative),
      uri: 'file://' + path.join(entry.root, entry.relative),
      score: entry.score,
    }));
}

function searchText(query, limit, scope, types) {
  const needle = query.trim();
  if (needle.length < 2) {
    return Promise.resolve([]);
  }
  const roots = scope ? [scope] : workspaceRoots();
  const results = [];
  return new Promise((resolve) => {
    let remaining = roots.length;
    if (!remaining) {
      resolve([]);
      return;
    }
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve(results.slice(0, limit));
      }
    };
    for (const root of roots) {
      ripgrep(root, needle, limit, types).then(
        (chunk) => {
          results.push(...chunk);
          done();
        },
        () => done()
      );
    }
  });
}

function ripgrep(cwd, query, limit, types) {
  return new Promise((resolve, reject) => {
    const args = [
      '--json',
      '--no-heading',
      '--line-number',
      '--smart-case',
      '--fixed-strings',
      '--max-count',
      '3',
      '--max-columns',
      '300',
      '--max-filesize',
      '2M',
      '--glob',
      '!**/node_modules/**',
      '--glob',
      '!**/.git/**',
    ];
    for (const type of types) {
      args.push('--glob', `*.${type}`);
    }
    args.push('--', query, '.');
    const child = spawn('rg', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    runningRg = child;
    const found = [];
    let buffer = '';
    let settled = false;

    const finish = (error) => {
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

    child.on('error', finish);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (found.length >= limit) {
          break;
        }
        const item = parseRgLine(line, cwd);
        if (item) {
          found.push(item);
        }
      }
      if (found.length >= limit) {
        finish();
      }
    });
    child.on('close', () => finish());
  });
}

function parseRgLine(line, cwd) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (parsed.type !== 'match' || !parsed.data || !parsed.data.path) {
    return undefined;
  }
  const raw = (parsed.data.lines && parsed.data.lines.text) || '';
  const text = raw.replace(/\r?\n$/, '').trim();
  if (!text) {
    return undefined;
  }
  const needle = parsed.data.submatches && parsed.data.submatches[0] && parsed.data.submatches[0].match.text;
  const match = [];
  if (needle) {
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index >= 0) {
      match.push([index, index + needle.length]);
    }
  }
  const relative = parsed.data.path.text.replace(/^\.\//, '');
  return {
    kind: 'text',
    label: text.length > 240 ? text.slice(0, 240) : text,
    detail: `${relative}:${parsed.data.line_number || 1}`,
    uri: 'file://' + path.join(cwd, relative),
    line: parsed.data.line_number || 1,
    column: 1,
    match,
    score: 1,
  };
}

async function searchAll(query, limit, scope, types) {
  const fileTypes = parseTypes(types);
  const [files, text] = await Promise.all([
    searchFiles(query, limit, scope, fileTypes),
    searchText(query, limit, scope, fileTypes),
  ]);
  return { files, text, symbols: [], actions: [] };
}

module.exports = {
  EMPTY_GROUPS,
  workspaceRoots,
  searchAll,
  searchFiles,
  searchText,
  parseTypes,
  cancel,
  fuzzyScore,
};
