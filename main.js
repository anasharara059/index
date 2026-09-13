const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

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

function createMainWindow() {
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

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
  });
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
