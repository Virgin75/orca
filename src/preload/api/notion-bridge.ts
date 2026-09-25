import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const notionApi = {
  status: () => ipcRenderer.invoke('notion:status'),
  connect: () => ipcRenderer.invoke('notion:connect'),
  disconnect: () => ipcRenderer.invoke('notion:disconnect'),
  search: (query) => ipcRenderer.invoke('notion:search', query),
  getTicket: (id) => ipcRenderer.invoke('notion:getTicket', id),
  getTicketDetail: (id) => ipcRenderer.invoke('notion:getTicketDetail', id),
  updateStatus: (args) => ipcRenderer.invoke('notion:updateStatus', args),
  createComment: (args) => ipcRenderer.invoke('notion:createComment', args),
  updateContent: (args) => ipcRenderer.invoke('notion:updateContent', args),
  getLinks: (worktreeId) => ipcRenderer.invoke('notion:getLinks', worktreeId),
  setLinks: (args) => ipcRenderer.invoke('notion:setLinks', args)
} satisfies PreloadApi['notion']
