// Standalone desktop overlay: a frameless always-on-top window centered on the
// screen, driven by a global shortcut (KDE/GNOME custom shortcut -> run.sh).
//
// It reuses the exact same UI as the VS Code webview (media/overlay.html,
// overlay.css, overlay.js) and opens results in VS Code via `code -g`.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EMPTY_GROUPS, searchAll, cancel } = require('./search');

const MEDIA = path.join(__dirname, '..', 'media');
const WIDTH = 820;
const HEIGHT = 480;
const SCREENSHOT = process.env.VS_SEARCH_SCREENSHOT;
const DEMO_QUERY = process.env.VS_SEARCH_DEMO_QUERY || 'fuzzyScore';

let win;
let generation = 0;
let timer;
let lastQuery = '';

function fileUrl(target) {
  return 'file://' + target.split(path.sep).join('/');
}

function renderHtml() {
  const template = fs.readFileSync(path.join(MEDIA, 'overlay.html'), 'utf8');
  const html = template
    .replace('{{cspMeta}}', '')
    .replace('{{styleHref}}', fileUrl(path.join(MEDIA, 'overlay.css')))
    .replace(
      '{{scriptTag}}',
      `<script src="${fileUrl(path.join(MEDIA, 'overlay.js'))}"></script>`
    )
    .replace(/\{\{theme\}\}/g, 'phpstorm')
    .replace(/\{\{mode\}\}/g, 'desktop');

  const dir = path.join(os.tmpdir(), 'vs-search-overlay');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'index.html');
  fs.writeFileSync(target, html);
  return target;
}

function centeredBounds() {
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  return {
    width: WIDTH,
    height: HEIGHT,
    x: Math.round(area.x + (area.width - WIDTH) / 2),
    y: Math.round(area.y + (area.height - HEIGHT) / 2),
  };
}

function createWindow() {
  win = new BrowserWindow({
    ...centeredBounds(),
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(renderHtml());

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('blur', () => {
    if (!SCREENSHOT && win && win.isVisible()) {
      hide();
    }
  });

  win.on('closed', () => {
    win = undefined;
  });

  if (SCREENSHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        await win.webContents.executeJavaScript(
          `document.getElementById('query').value = ${JSON.stringify(DEMO_QUERY)};`
        );
        schedule(DEMO_QUERY);
        setTimeout(async () => {
          const image = await win.webContents.capturePage();
          fs.writeFileSync(SCREENSHOT, image.toPNG());
          const markup = await win.webContents.executeJavaScript(
            'document.getElementById("results").innerHTML'
          );
          fs.writeFileSync(`${SCREENSHOT}.html`, markup);
          app.quit();
        }, 1800);
      }, 500);
    });
  }
}

function show() {
  if (!win) {
    createWindow();
    return;
  }
  win.setBounds(centeredBounds());
  win.show();
  win.focus();
  win.webContents.focus();
  send({ type: 'focus' });
}

function hide() {
  if (!win) {
    return;
  }
  cancel();
  generation += 1;
  lastQuery = '';
  win.hide();
}

function send(message) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('overlay:message', message);
  }
}

function schedule(query) {
  lastQuery = query;
  cancel();
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(run, 80);
}

async function run() {
  const query = lastQuery;
  const current = ++generation;

  if (!query.trim()) {
    send({ type: 'results', groups: EMPTY_GROUPS });
    return;
  }

  send({ type: 'busy', value: true });
  const groups = await searchAll(query, 15);
  if (current !== generation) {
    return;
  }
  send({ type: 'results', groups });
}

function openResult(item) {
  if (!item || !item.uri) {
    return false;
  }
  const file = decodeURIComponent(item.uri.replace(/^file:\/\//, ''));
  const position = `${file}:${item.line || 1}:${item.column || 1}`;
  try {
    spawn('code', ['-g', position], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    return false;
  }
  return true;
}

ipcMain.on('overlay:message', (event, message) => {
  if (!message || !message.type) {
    return;
  }
  switch (message.type) {
    case 'ready':
      send({ type: 'init', theme: 'phpstorm', mode: 'desktop', initial: '', tab: 'all' });
      break;
    case 'query':
      schedule(String(message.value || ''));
      break;
    case 'accept':
      if (openResult(message.item)) {
        hide();
      }
      break;
    case 'close':
      hide();
      break;
    default:
      break;
  }
  void event;
});

const gotLock = SCREENSHOT ? true : app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && win.isVisible() && win.isFocused()) {
      hide();
    } else {
      show();
    }
  });

  app.whenReady().then(() => {
    createWindow();
  });

  app.on('window-all-closed', () => {
    // Stay alive: the overlay is summoned again by the global shortcut.
  });

  app.on('activate', () => show());
}
