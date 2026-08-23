const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('codexDesk', {
  openProject: () => ipcRenderer.invoke('project:open'),
  getProject: () => ipcRenderer.invoke('project:get'),
  listFiles: () => ipcRenderer.invoke('files:list'),
  readFile: path => ipcRenderer.invoke('files:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('files:write', { path, content }),
  gitDiff: () => ipcRenderer.invoke('git:diff'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authStart: mode => ipcRenderer.invoke('auth:start', mode),
  openExternal: url => ipcRenderer.invoke('app:open-external', url),
  updateState: () => ipcRenderer.invoke('update:state'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  codexRun: options => ipcRenderer.invoke('codex:run', options),
  codexStop: () => ipcRenderer.invoke('codex:stop'),
  onCodexEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('codex:event', handler)
    return () => ipcRenderer.removeListener('codex:event', handler)
  },
  onAuthEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('auth:event', handler)
    return () => ipcRenderer.removeListener('auth:event', handler)
  },
  onUpdateEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('update:event', handler)
    return () => ipcRenderer.removeListener('update:event', handler)
  }
})
