import { create } from 'zustand'
import type {
  NotionCommentTarget,
  NotionLinkedTicket,
  NotionTicketDetail,
  NotionTicketSearchResult,
  NotionTicketSummary
} from '../../../shared/notion-types'

type DetailEntry =
  | { state: 'loading'; detail: NotionTicketDetail | null }
  | { state: 'ready'; detail: NotionTicketDetail }
  | { state: 'error'; error: string; detail: NotionTicketDetail | null }

type NotionTicketsState = {
  linksByWorktree: Record<string, NotionLinkedTicket[]>
  ticketsById: Record<string, NotionTicketSummary>
  ticketErrors: Record<string, string>
  detailsById: Record<string, DetailEntry>
  activeTicketByWorktree: Record<string, string>
  pendingStatusIds: Record<string, true>
  loadLinks: (worktreeId: string) => Promise<void>
  refreshTicket: (id: string) => Promise<void>
  refreshLinkedTickets: (worktreeId: string) => Promise<void>
  linkTickets: (worktreeId: string, tickets: NotionTicketSearchResult[]) => Promise<void>
  unlinkTicket: (worktreeId: string, id: string) => Promise<void>
  setActiveTicket: (worktreeId: string, id: string) => void
  loadDetail: (id: string, options?: { force?: boolean }) => Promise<void>
  updateStatus: (id: string, status: string) => Promise<string | null>
  /** Resolves a pasted page URL/id and links it; returns an error message on failure. */
  linkTicketFromUrl: (worktreeId: string, url: string) => Promise<string | null>
  addComment: (id: string, markdown: string, target: NotionCommentTarget) => Promise<string | null>
  saveContent: (id: string, baseContent: string, content: string) => Promise<string | null>
}

/** Desktop-only: the web client has no local Notion bridge. */
export function isNotionAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.api?.notion)
}

const loadedWorktrees = new Set<string>()

export const useNotionTicketsStore = create<NotionTicketsState>((set, get) => ({
  linksByWorktree: {},
  ticketsById: {},
  ticketErrors: {},
  detailsById: {},
  activeTicketByWorktree: {},
  pendingStatusIds: {},

  loadLinks: async (worktreeId) => {
    if (!isNotionAvailable() || loadedWorktrees.has(worktreeId)) {
      return
    }
    loadedWorktrees.add(worktreeId)
    const result = await window.api.notion.getLinks(worktreeId)
    if (!result.ok) {
      loadedWorktrees.delete(worktreeId)
      return
    }
    set((s) => ({ linksByWorktree: { ...s.linksByWorktree, [worktreeId]: result.value } }))
    await Promise.all(
      result.value
        .filter((ticket) => !get().ticketsById[ticket.id])
        .map((ticket) => get().refreshTicket(ticket.id))
    )
  },

  refreshTicket: async (id) => {
    const result = await window.api.notion.getTicket(id)
    if (result.ok) {
      set((s) => {
        const { [id]: _cleared, ...ticketErrors } = s.ticketErrors
        return { ticketsById: { ...s.ticketsById, [id]: result.value }, ticketErrors }
      })
    } else {
      set((s) => ({ ticketErrors: { ...s.ticketErrors, [id]: result.error } }))
    }
  },

  refreshLinkedTickets: async (worktreeId) => {
    const links = get().linksByWorktree[worktreeId] ?? []
    await Promise.all(links.map((ticket) => get().refreshTicket(ticket.id)))
  },

  linkTickets: async (worktreeId, tickets) => {
    const current = get().linksByWorktree[worktreeId] ?? []
    const added = tickets
      .filter((ticket) => !current.some((linked) => linked.id === ticket.id))
      .map(({ id, title, url }) => ({ id, title, url }))
    if (added.length === 0) {
      return
    }
    await persistLinks(worktreeId, [...current, ...added])
    await Promise.all(added.map((ticket) => get().refreshTicket(ticket.id)))
  },

  unlinkTicket: async (worktreeId, id) => {
    const current = get().linksByWorktree[worktreeId] ?? []
    await persistLinks(
      worktreeId,
      current.filter((ticket) => ticket.id !== id)
    )
  },

  setActiveTicket: (worktreeId, id) =>
    set((s) => ({ activeTicketByWorktree: { ...s.activeTicketByWorktree, [worktreeId]: id } })),

  loadDetail: async (id, options) => {
    const existing = get().detailsById[id]
    if (existing && !options?.force && existing.state !== 'error') {
      return
    }
    set((s) => ({
      detailsById: {
        ...s.detailsById,
        [id]: { state: 'loading', detail: existing?.detail ?? null }
      }
    }))
    const result = await window.api.notion.getTicketDetail(id)
    set((s) => ({
      detailsById: {
        ...s.detailsById,
        [id]: result.ok
          ? { state: 'ready', detail: result.value }
          : { state: 'error', error: result.error, detail: existing?.detail ?? null }
      },
      ...(result.ok ? { ticketsById: { ...s.ticketsById, [id]: result.value.ticket } } : {})
    }))
  },

  linkTicketFromUrl: async (worktreeId, url) => {
    const result = await window.api.notion.getTicket(url)
    if (!result.ok) {
      return result.error
    }
    const { id, title } = result.value
    set((s) => ({ ticketsById: { ...s.ticketsById, [id]: result.value } }))
    try {
      await get().linkTickets(worktreeId, [{ id, title, url: result.value.url, timestamp: null }])
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  },

  addComment: async (id, markdown, target) => {
    const result = await window.api.notion.createComment({ id, markdown, target })
    if (!result.ok) {
      return result.error
    }
    await get().loadDetail(id, { force: true })
    return null
  },

  saveContent: async (id, baseContent, content) => {
    const result = await window.api.notion.updateContent({ id, baseContent, content })
    if (!result.ok) {
      return result.error
    }
    await get().loadDetail(id, { force: true })
    return null
  },

  updateStatus: async (id, status) => {
    const previous = get().ticketsById[id]
    if (!previous?.status || previous.status.name === status) {
      return null
    }
    const option = previous.statusOptions.find((candidate) => candidate.name === status)
    const optimistic: NotionTicketSummary = {
      ...previous,
      status: { ...previous.status, name: status, color: option?.color ?? 'default' }
    }
    set((s) => ({
      ticketsById: { ...s.ticketsById, [id]: optimistic },
      pendingStatusIds: { ...s.pendingStatusIds, [id]: true }
    }))
    const result = await window.api.notion.updateStatus({ id, status })
    set((s) => {
      const { [id]: _done, ...pendingStatusIds } = s.pendingStatusIds
      const detail = s.detailsById[id]
      const ticket = result.ok ? result.value : previous
      return {
        pendingStatusIds,
        ticketsById: { ...s.ticketsById, [id]: ticket },
        detailsById:
          detail?.detail != null
            ? { ...s.detailsById, [id]: { ...detail, detail: { ...detail.detail, ticket } } }
            : s.detailsById
      }
    })
    return result.ok ? null : result.error
  }
}))

async function persistLinks(worktreeId: string, tickets: NotionLinkedTicket[]): Promise<void> {
  const result = await window.api.notion.setLinks({ worktreeId, tickets })
  if (!result.ok) {
    throw new Error(result.error)
  }
  useNotionTicketsStore.setState((s) => ({
    linksByWorktree: { ...s.linksByWorktree, [worktreeId]: result.value }
  }))
}
