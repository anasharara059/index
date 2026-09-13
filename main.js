const { app, BrowserWindow, ipcMain, screen } = require('electron');
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
let lastOverlayState = {
  time: '00:00:00',
  running: false,
  paused: false,
  visible: false
};

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 205,
    height: 64,
    minWidth: 160,
    minHeight: 50,
    maxWidth: 320,
    maxHeight: 100,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    const saved = overlayWindow.getPosition();
    if (!saved || saved.length !== 2) {
      const workArea = screen.getPrimaryDisplay().workArea;
      overlayWindow.setPosition(
        Math.round(workArea.x + workArea.width - 225),
        Math.round(workArea.y + 22)
      );
    }
    overlayWindow.webContents.send('mini-timer:state', lastOverlayState);
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

app.whenReady().then(async () => {
  await createMainWindow();
  createOverlayWindow();

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
  });
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
    visible: !!state?.visible
  };

  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.webContents.send('mini-timer:state', lastOverlayState);

  if (lastOverlayState.visible) {
    if (!overlayWindow.isVisible()) overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'floating');
  } else if (overlayWindow.isVisible()) {
    overlayWindow.hide();
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
});

ipcMain.handle('mini-timer:get-position', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null;
  return overlayWindow.getPosition();
});
