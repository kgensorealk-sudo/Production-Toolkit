const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    // Add custom APIs here if needed in the future
    // Example: getVersion: () => process.versions.electron
  }
);