const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let localServer;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      try {
        const requestedPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
        const filePath = path.resolve(__dirname, `.${relativePath}`);
        const root = path.resolve(__dirname);

        if (!filePath.startsWith(root + path.sep) && filePath !== root) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) throw new Error('Not a file');

        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };

        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (_err) {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    localServer.once('error', reject);
    localServer.listen(0, 'localhost', () => {
      const { port } = localServer.address();
      resolve(`http://localhost:${port}`);
    });
  });
}

let mainWindow;
let overlayWindow;
let isGhostMode = false;
let isOverlayPinnedTop = true;
let isOverlayCollapsed = false;

let lastOverlayState = {
  time: '00:00:00',
  running: false,
  paused: false,
  visible: false,
  progress: 0,
  theme: 'dark',
  mode: 'pomodoro',
  tag: 'Study',
  completed: false
};

// Keeps the overlay window floating over ANY fullscreen app, game, or video player
function ensureOverlayOnTop() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    // 'screen-saver' with level 1 is the highest z-band level in Windows Desktop Window Manager.
    // It stays strictly ABOVE fullscreen applications (YouTube fullscreen, VLC, F11 browser, games).
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.moveTop();
  } catch (err) {
    try { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {}
  }
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 270,
    height: 60,
    minWidth: 200,
    minHeight: 48,
    maxWidth: 380,
    maxHeight: 100,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: false, // Prevents stealing focus from full-screen media players and games
    hasShadow: false, // Avoids DWM shadow artifacts when floating over video surfaces
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  ensureOverlayOnTop();
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    const saved = overlayWindow.getPosition();
    if (!saved || saved.length !== 2) {
      const workArea = screen.getPrimaryDisplay().workArea;
      overlayWindow.setPosition(
        Math.round(workArea.x + (workArea.width - 270) / 2),
        Math.round(workArea.y)
      );
    }
    overlayWindow.webContents.send('mini-timer:state', lastOverlayState);
    ensureOverlayOnTop();
  });

  // Re-assert topmost on blur in case a fullscreen app steals focus
  overlayWindow.on('blur', () => {
    if (lastOverlayState.visible) {
      ensureOverlayOnTop();
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#08090d',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  const appUrl = await startLocalServer();
  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });
}

function setGhostMode(active) {
  isGhostMode = !!active;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(isGhostMode, { forward: true });
    overlayWindow.webContents.send('mini-timer:ghost-changed', isGhostMode);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mini-timer:ghost-changed', isGhostMode);
  }
}

function calculateSnappedPosition(x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const area = display.workArea;
  const SNAP_DIST = 26;

  let snappedX = Math.round(x);
  let snappedY = Math.round(y);
  let snappedToTopCenter = false;

  const centerX = Math.round(area.x + (area.width - w) / 2);

  // Magnet snap horizontal (left, right, center)
  if (Math.abs(snappedX - area.x) < SNAP_DIST) {
    snappedX = area.x;
  } else if (Math.abs(snappedX - (area.x + area.width - w)) < SNAP_DIST) {
    snappedX = area.x + area.width - w;
  } else if (Math.abs(snappedX - centerX) < SNAP_DIST) {
    snappedX = centerX;
  }

  // Magnet snap vertical (top, bottom)
  if (Math.abs(snappedY - area.y) < SNAP_DIST) {
    snappedY = area.y;
    if (Math.abs(snappedX - centerX) < 48) {
      snappedX = centerX;
      snappedToTopCenter = true;
    }
  } else if (Math.abs(snappedY - (area.y + area.height - h)) < SNAP_DIST) {
    snappedY = area.y + area.height - h;
  }

  snappedX = Math.max(area.x, Math.min(snappedX, area.x + area.width - w));
  snappedY = Math.max(area.y, Math.min(snappedY, area.y + area.height - h));

  return { x: snappedX, y: snappedY, isPinnedTop: snappedToTopCenter };
}

app.whenReady().then(async () => {
  await createMainWindow();
  createOverlayWindow();

  // Periodic assertion of topmost Z-order to survive dynamic fullscreen transitions
  setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      ensureOverlayOnTop();
    }
  }, 2000);

  try {
    globalShortcut.register('CommandOrControl+Alt+G', () => {
      setGhostMode(!isGhostMode);
    });
    globalShortcut.register('CommandOrControl+Alt+T', () => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.showInactive();
        ensureOverlayOnTop();
      }
    });
  } catch (err) {
    console.error('Failed to register global shortcuts:', err);
  }

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
  });
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
});

app.on('before-quit', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('mini-timer:update', (_event, state) => {
  lastOverlayState = {
    time: String(state?.time || '00:00:00'),
    running: !!state?.running,
    paused: !!state?.paused,
    visible: !!state?.visible,
    progress: Number.isFinite(state?.progress) ? Math.max(0, Math.min(100, state.progress)) : 0,
    theme: state?.theme === 'light' ? 'light' : 'dark',
    mode: String(state?.mode || 'pomodoro'),
    tag: String(state?.tag || 'Study'),
    completed: !!state?.completed
  };

  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.webContents.send('mini-timer:state', lastOverlayState);

  if (lastOverlayState.visible) {
    if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive();
    }
    ensureOverlayOnTop();
  } else if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  }
});

ipcMain.on('mini-timer:pin-top', (_event, pinned) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  isOverlayPinnedTop = !!pinned;
  if (pinned) {
    const pos = overlayWindow.getPosition();
    const display = screen.getDisplayNearestPoint({ x: pos[0], y: pos[1] });
    const area = display.workArea;
    const [w, h] = overlayWindow.getSize();
    const centerX = Math.round(area.x + (area.width - w) / 2);
    const topY = area.y;
    overlayWindow.setPosition(centerX, topY);
    ensureOverlayOnTop();
  }
});

ipcMain.on('mini-timer:set-collapsed', (_event, collapsed) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  isOverlayCollapsed = !!collapsed;
  const [curW] = overlayWindow.getSize();
  const [curX, curY] = overlayWindow.getPosition();
  const targetH = isOverlayCollapsed ? 7 : 60;
  overlayWindow.setBounds({ x: curX, y: curY, width: curW, height: targetH });
  ensureOverlayOnTop();
});

ipcMain.on('mini-timer:set-ghost-mode', (_event, isGhost) => {
  setGhostMode(isGhost);
});

ipcMain.on('mini-timer:set-opacity', (_event, opacity) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const val = Math.max(0.18, Math.min(1.0, Number(opacity) || 1.0));
  try {
    overlayWindow.setOpacity(val);
  } catch (_) {}
});

ipcMain.on('mini-timer:toggle-play-pause', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mini-timer:command', { action: 'toggle-play-pause' });
  }
});

ipcMain.on('mini-timer:hide', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
});

ipcMain.on('mini-timer:move', (_event, { x, y }) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  const [w, h] = overlayWindow.getSize();
  const clampedX = Math.max(area.x, Math.min(Math.round(x), area.x + area.width - w));
  const clampedY = Math.max(area.y, Math.min(Math.round(y), area.y + area.height - h));
  overlayWindow.setPosition(clampedX, clampedY);
  ensureOverlayOnTop();
});

ipcMain.handle('mini-timer:snap-move', (_event, { x, y }) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null;
  const [w, h] = overlayWindow.getSize();
  const snapped = calculateSnappedPosition(x, y, w, h);
  overlayWindow.setPosition(snapped.x, snapped.y);
  ensureOverlayOnTop();
  return snapped;
});

ipcMain.handle('mini-timer:get-position', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null;
  return overlayWindow.getPosition();
});