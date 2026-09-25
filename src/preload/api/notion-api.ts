import type {
  NotionCommentTarget,
  NotionConnectionStatus,
  NotionLinkedTicket,
  NotionResult,
  NotionTicketDetail,
  NotionTicketSearchResult,
  NotionTicketSummary
} from '../../shared/notion-types'

export type NotionApi = {
  status: () => Promise<NotionConnectionStatus>
  connect: () => Promise<NotionResult<void>>
  disconnect: () => Promise<void>
  search: (query: string) => Promise<NotionResult<NotionTicketSearchResult[]>>
  getTicket: (id: string) => Promise<NotionResult<NotionTicketSummary>>
  getTicketDetail: (id: string) => Promise<NotionResult<NotionTicketDetail>>
  updateStatus: (args: { id: string; status: string }) => Promise<NotionResult<NotionTicketSummary>>
  createComment: (args: {
    id: string
    markdown: string
    target: NotionCommentTarget
  }) => Promise<NotionResult<void>>
  updateContent: (args: {
    id: string
    baseContent: string
    content: string
  }) => Promise<NotionResult<void>>
  getLinks: (worktreeId: string) => Promise<NotionResult<NotionLinkedTicket[]>>
  setLinks: (args: {
    worktreeId: string
    tickets: NotionLinkedTicket[]
  }) => Promise<NotionResult<NotionLinkedTicket[]>>
}
