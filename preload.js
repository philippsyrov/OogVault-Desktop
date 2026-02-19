import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  importJson: () => ipcRenderer.invoke('dialog:importJson'),
  exportJson: (jsonString, defaultName) =>
    ipcRenderer.invoke('dialog:exportJson', jsonString, defaultName),
  exportMarkdown: (markdown, defaultName) =>
    ipcRenderer.invoke('dialog:exportMarkdown', markdown, defaultName),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
