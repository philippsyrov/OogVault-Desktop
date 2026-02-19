import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow;

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ── IPC Handlers ── */

ipcMain.handle('dialog:importJson', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
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
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
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
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
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

ipcMain.handle('clipboard:writeText', async (_event, text) => {
  const { clipboard } = await import('electron');
  clipboard.writeText(text);
  return true;
});
