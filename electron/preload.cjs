const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('codexDesk', {
  openProject: () => ipcRenderer.invoke('project:open'),
  createWorkspace: () => ipcRenderer.invoke('project:create-workspace'),
  getProject: () => ipcRenderer.invoke('project:get'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSave: settings => ipcRenderer.invoke('settings:save', settings),
  settingsClearLocalData: () => ipcRenderer.invoke('settings:clear-local-data'),
  appUninstall: () => ipcRenderer.invoke('app:uninstall'),
  listFiles: () => ipcRenderer.invoke('files:list'),
  readFile: path => ipcRenderer.invoke('files:read', path),
  resolveFileLink: reference => ipcRenderer.invoke('files:resolve-link', reference),
  writeFile: (path, content) => ipcRenderer.invoke('files:write', { path, content }),
  saveAttachment: payload => ipcRenderer.invoke('attachments:save', payload),
  removeAttachments: paths => ipcRenderer.invoke('attachments:remove', paths),
  historyGet: () => ipcRenderer.invoke('history:get'),
  historySave: payload => ipcRenderer.invoke('history:save', payload),
  historyAppend: payload => ipcRenderer.invoke('history:append', payload),
  historyUpdateEvent: payload => ipcRenderer.invoke('history:update-event', payload),
  historyList: () => ipcRenderer.invoke('history:list'),
  historyNew: () => ipcRenderer.invoke('history:new'),
  historyOpen: id => ipcRenderer.invoke('history:open', id),
  historyClear: id => ipcRenderer.invoke('history:clear', id),
  undoCreate: label => ipcRenderer.invoke('undo:create', label),
  undoList: () => ipcRenderer.invoke('undo:list'),
  undoRestore: id => ipcRenderer.invoke('undo:restore', id),
  gitDiff: () => ipcRenderer.invoke('git:diff'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authStart: mode => ipcRenderer.invoke('auth:start', mode),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  usageGet: () => ipcRenderer.invoke('usage:get'),
  mcpList: () => ipcRenderer.invoke('mcp:list'),
  mcpAdd: payload => ipcRenderer.invoke('mcp:add', payload),
  mcpRemove: name => ipcRenderer.invoke('mcp:remove', name),
  mcpToggle: (name, enabled) => ipcRenderer.invoke('mcp:toggle', { name, enabled }),
  mcpLogin: name => ipcRenderer.invoke('mcp:login', name),
  mcpLogout: name => ipcRenderer.invoke('mcp:logout', name),
  openExternal: url => ipcRenderer.invoke('app:open-external', url),
  openLink: url => ipcRenderer.invoke('app:open-link', url),
  copyText: text => ipcRenderer.invoke('clipboard:write', text),
  updateState: () => ipcRenderer.invoke('update:state'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  codexPlan: options => ipcRenderer.invoke('codex:plan', options),
  codexRun: options => ipcRenderer.invoke('codex:run', options),
  codexStop: conversationId => ipcRenderer.invoke('codex:stop', conversationId),
  onCodexEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('codex:event', handler)
    return () => ipcRenderer.removeListener('codex:event', handler)
  },
  onFilesChanged: callback => {
    const handler = () => callback()
    ipcRenderer.on('files:changed', handler)
    return () => ipcRenderer.removeListener('files:changed', handler)
  },
  onAuthEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('auth:event', handler)
    return () => ipcRenderer.removeListener('auth:event', handler)
  },
  onMcpEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('mcp:event', handler)
    return () => ipcRenderer.removeListener('mcp:event', handler)
  },
  onUpdateEvent: callback => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('update:event', handler)
    return () => ipcRenderer.removeListener('update:event', handler)
  }
})
