"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { clipboard, contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
    importJson: () => ipcRenderer.invoke('dialog:importJson'),
    exportJson: (jsonString, defaultName) => ipcRenderer.invoke('dialog:exportJson', jsonString, defaultName),
    exportMarkdown: (markdown, defaultName) => ipcRenderer.invoke('dialog:exportMarkdown', markdown, defaultName),
    copyToClipboard: (text) => clipboard.writeText(text),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openConversation: (id) => ipcRenderer.send('open-conversation', id),
    onNavigateToConversation: (callback) => ipcRenderer.on('navigate-to-conversation', (_event, id) => callback(id)),
    onQuickSearchFocus: (callback) => ipcRenderer.on('quick-search:focus', () => callback()),
    hideQuickSearch: () => ipcRenderer.send('quick-search:hide'),
    resizeQuickSearch: (height) => ipcRenderer.send('quick-search:resize', height),
    notifyDataChanged: () => ipcRenderer.send('vault:dataChanged'),
});
