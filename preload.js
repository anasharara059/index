const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateMiniTimer: (state) => ipcRenderer.send('mini-timer:update', state),
  hideMiniTimer: () => ipcRenderer.send('mini-timer:hide'),
  moveMiniTimer: (x, y) => ipcRenderer.send('mini-timer:move', { x, y }),
  getMiniTimerPosition: () => ipcRenderer.invoke('mini-timer:get-position'),
  onMiniTimerState: (callback) => {
    ipcRenderer.on('mini-timer:state', (_event, state) => callback(state));
  }
});
