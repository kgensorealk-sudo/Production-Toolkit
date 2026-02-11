
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electron',
  {
    isElectron: true,
    saveFile: async (content, defaultName, extension) => {
      return await ipcRenderer.invoke('SAVE_FILE', { content, defaultName, extension });
    }
  }
);
