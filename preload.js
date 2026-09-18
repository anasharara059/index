const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateMiniTimer: (state) => ipcRenderer.send('mini-timer:update', state),
  hideMiniTimer: () => ipcRenderer.send('mini-timer:hide'),
  moveMiniTimer: (x, y) => ipcRenderer.send('mini-timer:move', { x, y }),
  getMiniTimerPosition: () => ipcRenderer.invoke('mini-timer:get-position'),
  pinMiniTimerTop: (pinned) => ipcRenderer.send('mini-timer:pin-top', pinned),
  togglePlayPause: () => ipcRenderer.send('mini-timer:toggle-play-pause'),
  onMiniTimerState: (callback) => {
    ipcRenderer.on('mini-timer:state', (_event, state) => callback(state));
  },
  onMiniTimerCommand: (callback) => {
    ipcRenderer.on('mini-timer:command', (_event, cmd) => callback(cmd));
  }
});