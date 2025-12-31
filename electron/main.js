const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged; // Simple check for dev vs prod

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: "Production Toolkit",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    autoHideMenuBar: true, // Hides the default file menu for a cleaner look
    backgroundColor: '#f8fafc', // Matches the slate-50 background
  });

  // Load the app
  if (isDev) {
    // In development, load from the local dev server (Vite uses port 5173 by default)
    mainWindow.loadURL('http://localhost:5173');
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html from the 'dist' folder
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle external links (target="_blank" or window.open)
  // This ensures links to documentation or CRediT definitions open in Chrome/Edge, not the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});