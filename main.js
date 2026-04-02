import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray, } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let tray = null;
let quickSearchWindow = null;
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 760,
        minHeight: 520,
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1410',
        webPreferences: {
            preload: join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: join(__dirname, 'assets', 'icon.png'),
        show: false,
    });
    mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => writeSnapshotFromWindow(mainWindow), 1000);
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function showMainWindow() {
    if (!mainWindow) {
        createWindow();
        return;
    }
    mainWindow.show();
    mainWindow.focus();
}
function createQuickSearchWindow() {
    quickSearchWindow = new BrowserWindow({
        width: 620,
        height: 460,
        type: 'panel',
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        webPreferences: {
            preload: join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    quickSearchWindow.loadFile(join(__dirname, 'renderer', 'quicksearch.html'));
    let blurTimer = null;
    quickSearchWindow.on('blur', () => {
        blurTimer = setTimeout(() => {
            quickSearchWindow?.hide();
        }, 250);
    });
    quickSearchWindow.on('focus', () => {
        if (blurTimer) {
            clearTimeout(blurTimer);
            blurTimer = null;
        }
    });
    quickSearchWindow.on('closed', () => {
        quickSearchWindow = null;
    });
}
function showQuickSearch() {
    if (!quickSearchWindow) {
        createQuickSearchWindow();
    }
    if (!quickSearchWindow) {
        return;
    }
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    quickSearchWindow.setPosition(x + Math.floor((width - 620) / 2), y + Math.floor(height / 3));
    quickSearchWindow.setSize(620, 240, false);
    quickSearchWindow.show();
    quickSearchWindow.focus();
    quickSearchWindow.webContents.send('quick-search:focus');
}
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
app.whenReady().then(() => {
    createWindow();
    createTray();
    globalShortcut.register('CmdOrCtrl+Shift+Space', showQuickSearch);
    app.on('activate', showMainWindow);
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
ipcMain.on('quick-search:hide', () => {
    quickSearchWindow?.hide();
});
ipcMain.on('quick-search:resize', (_event, height) => {
    if (!quickSearchWindow || quickSearchWindow.isDestroyed() || typeof height !== 'number') {
        return;
    }
    const clamped = Math.max(160, Math.min(460, Math.round(height)));
    quickSearchWindow.setSize(620, clamped, false);
});
ipcMain.on('open-conversation', (_event, id) => {
    if (typeof id !== 'string') {
        return;
    }
    showMainWindow();
    if (!mainWindow) {
        return;
    }
    if (mainWindow.isVisible()) {
        mainWindow.webContents.send('navigate-to-conversation', id);
        return;
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.webContents.send('navigate-to-conversation', id);
    });
});
ipcMain.handle('dialog:importJson', async () => {
    mainWindow?.focus();
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import OogVault Export',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) {
        return null;
    }
    try {
        const raw = readFileSync(filePaths[0], 'utf-8');
        return JSON.parse(raw);
    }
    catch (error) {
        console.error('[OogVault] Import failed:', error);
        return { error: 'Could not read or parse file.' };
    }
});
ipcMain.handle('dialog:exportJson', async (_event, jsonString, defaultName) => {
    mainWindow?.focus();
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export OogVault Data',
        defaultPath: defaultName || 'oogvault-export.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) {
        return false;
    }
    try {
        writeFileSync(filePath, jsonString, 'utf-8');
        return true;
    }
    catch (error) {
        console.error('[OogVault] Export JSON failed:', error);
        return false;
    }
});
ipcMain.handle('dialog:exportMarkdown', async (_event, markdown, defaultName) => {
    mainWindow?.focus();
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export as Markdown',
        defaultPath: defaultName || 'oogvault-export.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (canceled || !filePath) {
        return false;
    }
    try {
        writeFileSync(filePath, markdown, 'utf-8');
        await shell.openPath(filePath);
        return true;
    }
    catch (error) {
        console.error('[OogVault] Export Markdown failed:', error);
        return false;
    }
});
ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
        await shell.openExternal(url);
    }
    return true;
});
function getSnapshotPath() {
    return join(app.getPath('userData'), 'vault-snapshot.json');
}
function writeSnapshotFromWindow(win) {
    if (!win || win.isDestroyed()) {
        return;
    }
    const code = `
    (async () => {
      const { getAllConversations, getAllMessages, getAllNuggets } = await import('../lib/db.js');
      const conversations = await getAllConversations();
      const messages = await getAllMessages();
      const nuggets = await getAllNuggets();
      return JSON.stringify({ conversations, messages, nuggets });
    })()
  `;
    win.webContents
        .executeJavaScript(code)
        .then((json) => {
        const snapshotPath = getSnapshotPath();
        mkdirSync(dirname(snapshotPath), { recursive: true });
        writeFileSync(snapshotPath, String(json), 'utf-8');
    })
        .catch((error) => {
        console.error('[OogVault] Snapshot write failed:', getErrorMessage(error));
    });
}
ipcMain.on('vault:dataChanged', () => {
    writeSnapshotFromWindow(mainWindow);
});
ipcMain.handle('vault:getSnapshotPath', () => getSnapshotPath());
