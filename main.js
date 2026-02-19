import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, globalShortcut, nativeImage, screen } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let tray = null;
let quickSearchWindow = null;

/* ── Main Window ── */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 760,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1410',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: join(__dirname, 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

/* ── Quick Search Window ── */

function createQuickSearchWindow() {
  quickSearchWindow = new BrowserWindow({
    width: 620,
    height: 460,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  quickSearchWindow.loadFile(join(__dirname, 'renderer', 'quicksearch.html'));

  // Delay the blur-to-hide slightly so that click events on footer buttons
  // can fire before the window disappears.
  let blurTimer = null;
  quickSearchWindow.on('blur', () => {
    blurTimer = setTimeout(() => { quickSearchWindow.hide(); }, 150);
  });
  quickSearchWindow.on('focus', () => {
    clearTimeout(blurTimer);
  });

  quickSearchWindow.on('closed', () => {
    quickSearchWindow = null;
  });
}

function showQuickSearch() {
  if (!quickSearchWindow) createQuickSearchWindow();

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;

  quickSearchWindow.setPosition(
    x + Math.floor((width - 620) / 2),
    y + Math.floor(height / 3),
  );

  quickSearchWindow.show();
  quickSearchWindow.focus();
  quickSearchWindow.webContents.send('quick-search:focus');
}

/* ── Tray ── */

function createTray() {
  const icon = nativeImage
    .createFromPath(join(__dirname, 'assets', 'icon.png'))
    .resize({ width: 16, height: 16 });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('OogVault — Quick Search (⌘⇧Space)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quick Search',
      accelerator: 'CmdOrCtrl+Shift+Space',
      click: showQuickSearch,
    },
    {
      label: 'Open OogVault',
      click: showMainWindow,
    },
    { type: 'separator' },
    { label: 'Quit OogVault', role: 'quit' },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', showQuickSearch);
}

/* ── App lifecycle ── */

app.whenReady().then(() => {
  createWindow();
  createTray();

  globalShortcut.register('CmdOrCtrl+Shift+Space', showQuickSearch);

  app.on('activate', showMainWindow);
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS; quit on other platforms
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

/* ── IPC Handlers ── */

ipcMain.on('quick-search:hide', () => {
  if (quickSearchWindow) quickSearchWindow.hide();
});

ipcMain.on('open-conversation', (_event, id) => {
  showMainWindow();
  // Wait for the window to be ready before sending navigation event
  if (mainWindow.isVisible()) {
    mainWindow.webContents.send('navigate-to-conversation', id);
  } else {
    mainWindow.once('ready-to-show', () => {
      mainWindow.webContents.send('navigate-to-conversation', id);
    });
  }
});

ipcMain.handle('dialog:importJson', async () => {
  mainWindow.focus();
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import OogVault Export',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) return null;

  try {
    const raw = readFileSync(filePaths[0], 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[OogVault] Import failed:', err);
    return { error: 'Could not read or parse file.' };
  }
});

ipcMain.handle('dialog:exportJson', async (_event, jsonString, defaultName) => {
  mainWindow.focus();
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export OogVault Data',
    defaultPath: defaultName || 'oogvault-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePath) return false;

  try {
    writeFileSync(filePath, jsonString, 'utf-8');
    return true;
  } catch (err) {
    console.error('[OogVault] Export JSON failed:', err);
    return false;
  }
});

ipcMain.handle('dialog:exportMarkdown', async (_event, markdown, defaultName) => {
  mainWindow.focus();
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export as Markdown',
    defaultPath: defaultName || 'oogvault-export.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (canceled || !filePath) return false;

  try {
    writeFileSync(filePath, markdown, 'utf-8');
    shell.openPath(filePath);
    return true;
  } catch (err) {
    console.error('[OogVault] Export Markdown failed:', err);
    return false;
  }
});


ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    await shell.openExternal(url);
  }
  return true;
});
