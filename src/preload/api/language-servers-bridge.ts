import { ipcRenderer } from 'electron'
import type { LanguageServerStatusSnapshot } from '../../shared/language-server-types'
import type { PreloadApi } from '../api-types'

export const languageServersApi = {
  prepare: (args) => ipcRenderer.invoke('languageServers:prepare', args),
  definition: (args) => ipcRenderer.invoke('languageServers:definition', args),
  startWorkspace: (rootPath) => ipcRenderer.invoke('languageServers:startWorkspace', rootPath),
  restart: () => ipcRenderer.invoke('languageServers:restart'),
  getStatus: () => ipcRenderer.invoke('languageServers:getStatus'),
  onStatusChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      snapshot: LanguageServerStatusSnapshot
    ): void => callback(snapshot)
    ipcRenderer.on('languageServers:statusChanged', listener)
    return () => ipcRenderer.removeListener('languageServers:statusChanged', listener)
  }
} satisfies PreloadApi['languageServers']
