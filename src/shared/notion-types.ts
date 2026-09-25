/** Notion's named option colors (select/status options carry one of these). */
export type NotionOptionColor =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

export type NotionPropertyOption = {
  name: string
  color: NotionOptionColor
}

export type NotionTicketStatus = NotionPropertyOption & {
  /** Property the status was read from, used when writing it back. */
  propertyName: string
}

export type NotionTicketSearchResult = {
  id: string
  title: string
  url: string
  /** Human-readable "last edited" hint as Notion reports it. */
  timestamp: string | null
}

export type NotionTicketSummary = {
  id: string
  title: string
  url: string
  status: NotionTicketStatus | null
  priority: NotionPropertyOption | null
  /** Options the status can be switched to, from the ticket's data source. */
  statusOptions: NotionPropertyOption[]
}

export type NotionTicketComment = {
  id: string
  author: string | null
  createdAt: string | null
  /** Markdown body (Notion HTML-ish markup already converted). */
  body: string
}

export type NotionDiscussion = {
  /** `discussion://<page>/<block>/<discussion>` — also the reply target. */
  id: string
  /** `page` for page-level threads; `inline` when anchored to a text selection. */
  context: string
  /** Anchored text for inline discussions. */
  textContext: string | null
  resolved: boolean
  comments: NotionTicketComment[]
}

export type NotionTicketDetail = {
  ticket: NotionTicketSummary
  /** Page content as Markdown; anchored text is wrapped in `<mark data-discussions="…">`. */
  content: string
  /** Notion-flavored source the edit mode works on. */
  rawContent: string
  discussions: NotionDiscussion[]
}

export type NotionCommentTarget =
  | { kind: 'page' }
  | { kind: 'selection'; selection: string }
  | { kind: 'reply'; discussionId: string }

/** Snapshot kept next to each workspace link so the header renders before a refetch. */
export type NotionLinkedTicket = {
  id: string
  title: string
  url: string
}

export type NotionConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export type NotionConnectionStatus = {
  state: NotionConnectionState
  error: string | null
}

export type NotionResult<T> = { ok: true; value: T } | { ok: false; error: string }
