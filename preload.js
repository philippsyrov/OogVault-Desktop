import { contextBridge, ipcRenderer, clipboard } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  importJson: () => ipcRenderer.invoke('dialog:importJson'),
  exportJson: (jsonString, defaultName) =>
    ipcRenderer.invoke('dialog:exportJson', jsonString, defaultName),
  exportMarkdown: (markdown, defaultName) =>
    ipcRenderer.invoke('dialog:exportMarkdown', markdown, defaultName),

  // Clipboard (synchronous — no IPC round-trip needed)
  copyToClipboard: (text) => clipboard.writeText(text),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Quick search → main window navigation
  openConversation: (id) => ipcRenderer.send('open-conversation', id),

  // Main window: receive navigation requests from quick search
  onNavigateToConversation: (callback) =>
    ipcRenderer.on('navigate-to-conversation', (_e, id) => callback(id)),

  // Quick search window: receive focus signal to clear + focus input
  onQuickSearchFocus: (callback) =>
    ipcRenderer.on('quick-search:focus', () => callback()),

  // Quick search window: ask main process to hide the overlay
  hideQuickSearch: () => ipcRenderer.send('quick-search:hide'),
});
