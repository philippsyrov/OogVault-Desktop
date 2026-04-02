const { clipboard, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importJson: () => ipcRenderer.invoke('dialog:importJson'),
  exportJson: (jsonString: string, defaultName?: string) =>
    ipcRenderer.invoke('dialog:exportJson', jsonString, defaultName),
  exportMarkdown: (markdown: string, defaultName?: string) =>
    ipcRenderer.invoke('dialog:exportMarkdown', markdown, defaultName),
  copyToClipboard: (text: string) => clipboard.writeText(text),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openConversation: (id: string) => ipcRenderer.send('open-conversation', id),
  onNavigateToConversation: (callback: (id: string) => void) =>
    ipcRenderer.on('navigate-to-conversation', (_event: unknown, id: string) => callback(id)),
  onQuickSearchFocus: (callback: () => void) =>
    ipcRenderer.on('quick-search:focus', () => callback()),
  hideQuickSearch: () => ipcRenderer.send('quick-search:hide'),
  resizeQuickSearch: (height: number) => ipcRenderer.send('quick-search:resize', height),
  notifyDataChanged: () => ipcRenderer.send('vault:dataChanged'),
});
