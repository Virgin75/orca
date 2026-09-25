import { app, ipcMain } from 'electron'
import type {
  NotionCommentTarget,
  NotionConnectionStatus,
  NotionLinkedTicket,
  NotionResult
} from '../../shared/notion-types'
import { notionMcpConnection } from '../notion/notion-mcp-connection'
import {
  createNotionTicketComment,
  getNotionTicket,
  getNotionTicketDetail,
  searchNotionTickets,
  updateNotionTicketContent,
  updateNotionTicketStatus
} from '../notion/notion-tickets'
import { getNotionWorkspaceLinks, setNotionWorkspaceLinks } from '../notion/notion-workspace-links'

async function toResult<T>(run: () => Promise<T> | T): Promise<NotionResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Invalid ${field}`)
  }
  return value
}

function readLinkedTickets(value: unknown): NotionLinkedTicket[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid tickets')
  }
  return value.flatMap((entry: unknown) =>
    typeof entry === 'object' &&
    entry !== null &&
    'id' in entry &&
    typeof entry.id === 'string' &&
    'title' in entry &&
    typeof entry.title === 'string' &&
    'url' in entry &&
    typeof entry.url === 'string'
      ? [{ id: entry.id, title: entry.title, url: entry.url }]
      : []
  )
}

function readCommentTarget(value: unknown): NotionCommentTarget {
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if (value.kind === 'selection' && 'selection' in value) {
      return { kind: 'selection', selection: requireString(value.selection, 'selection') }
    }
    if (value.kind === 'reply' && 'discussionId' in value) {
      return { kind: 'reply', discussionId: requireString(value.discussionId, 'discussion') }
    }
  }
  return { kind: 'page' }
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {}
}

export function registerNotionHandlers(): void {
  ipcMain.handle('notion:status', (): NotionConnectionStatus => notionMcpConnection.getStatus())
  ipcMain.handle('notion:connect', () => toResult(() => notionMcpConnection.connect()))
  ipcMain.handle('notion:disconnect', () => notionMcpConnection.stop())
  ipcMain.handle('notion:search', (_event, query: unknown) =>
    toResult(() => searchNotionTickets(typeof query === 'string' ? query : ''))
  )
  ipcMain.handle('notion:getTicket', (_event, id: unknown) =>
    toResult(() => getNotionTicket(requireString(id, 'ticket id')))
  )
  ipcMain.handle('notion:getTicketDetail', (_event, id: unknown) =>
    toResult(() => getNotionTicketDetail(requireString(id, 'ticket id')))
  )
  ipcMain.handle('notion:updateStatus', (_event, args: unknown) =>
    toResult(() => {
      const raw = typeof args === 'object' && args !== null ? args : {}
      return updateNotionTicketStatus(
        requireString('id' in raw ? raw.id : null, 'ticket id'),
        requireString('status' in raw ? raw.status : null, 'status')
      )
    })
  )
  ipcMain.handle('notion:createComment', (_event, args: unknown) =>
    toResult(() => {
      const raw = readObject(args)
      return createNotionTicketComment(
        requireString(raw.id, 'ticket id'),
        requireString(raw.markdown, 'comment'),
        readCommentTarget(raw.target)
      )
    })
  )
  ipcMain.handle('notion:updateContent', (_event, args: unknown) =>
    toResult(() => {
      const raw = readObject(args)
      if (typeof raw.baseContent !== 'string' || typeof raw.content !== 'string') {
        throw new Error('Invalid content')
      }
      return updateNotionTicketContent(
        requireString(raw.id, 'ticket id'),
        raw.baseContent,
        raw.content
      )
    })
  )
  ipcMain.handle('notion:getLinks', (_event, worktreeId: unknown) =>
    toResult(() => getNotionWorkspaceLinks(requireString(worktreeId, 'workspace id')))
  )
  ipcMain.handle('notion:setLinks', (_event, args: unknown) =>
    toResult(() => {
      const raw = typeof args === 'object' && args !== null ? args : {}
      return setNotionWorkspaceLinks(
        requireString('worktreeId' in raw ? raw.worktreeId : null, 'workspace id'),
        readLinkedTickets('tickets' in raw ? raw.tickets : null)
      )
    })
  )
  // Why: the mcp-remote bridge is a long-lived child; don't leave it running after quit.
  app.on('will-quit', () => notionMcpConnection.stop())
}
