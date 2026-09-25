import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  NotionCommentTarget,
  NotionPropertyOption,
  NotionTicketDetail,
  NotionTicketSearchResult,
  NotionTicketSummary
} from '../../shared/notion-types'
import { notionMcpConnection } from './notion-mcp-connection'
import { computeNotionContentUpdates, stripVolatileUrlSignatures } from './notion-content-edits'
import {
  normalizeNotionId,
  notionMarkupToMarkdown,
  parseDataSourceSchema,
  parseDiscussions,
  parseFetchedPage,
  parseSearchResults,
  type NotionFetchedPage,
  type NotionSchemaProperty
} from './notion-mcp-parsing'

// Why: tickets live in one Notion database; searching the whole workspace surfaces docs and Drive files.
const DEFAULT_TICKETS_DATA_SOURCE_URL = 'collection://4e7ef2d3-a6f0-48df-bcce-d16362ff6e91'
const SCHEMA_TTL_MS = 10 * 60_000
const SEARCH_PAGE_SIZE = 20

const schemaCache = new Map<string, { properties: NotionSchemaProperty[]; fetchedAt: number }>()

/** `~/.orca/notion.json` may override the tickets database: `{ "ticketsDataSourceUrl": "collection://…" }`. */
function getTicketsDataSourceUrl(): string {
  const path = join(homedir(), '.orca', 'notion.json')
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'ticketsDataSourceUrl' in parsed &&
        typeof parsed.ticketsDataSourceUrl === 'string' &&
        parsed.ticketsDataSourceUrl.startsWith('collection://')
      ) {
        return parsed.ticketsDataSourceUrl
      }
    } catch {
      // Malformed override: fall back to the default database.
    }
  }
  return DEFAULT_TICKETS_DATA_SOURCE_URL
}

export async function searchNotionTickets(query: string): Promise<NotionTicketSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }
  const text = await notionMcpConnection.callTool('search', {
    query: trimmed,
    data_source_url: getTicketsDataSourceUrl(),
    page_size: SEARCH_PAGE_SIZE,
    max_highlight_length: 0
  })
  return parseSearchResults(text)
}

async function fetchPage(id: string): Promise<NotionFetchedPage> {
  return parseFetchedPage(await notionMcpConnection.callTool('fetch', { id }))
}

async function getSchema(dataSourceUrl: string | null): Promise<NotionSchemaProperty[]> {
  if (!dataSourceUrl) {
    return []
  }
  const cached = schemaCache.get(dataSourceUrl)
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL_MS) {
    return cached.properties
  }
  const properties = parseDataSourceSchema(
    await notionMcpConnection.callTool('fetch', { id: dataSourceUrl })
  )
  schemaCache.set(dataSourceUrl, { properties, fetchedAt: Date.now() })
  return properties
}

function findStatusProperty(schema: NotionSchemaProperty[]): NotionSchemaProperty | null {
  const statuses = schema.filter((property) => property.type === 'status')
  return (
    statuses.find((property) => property.name.toLowerCase() === 'status') ??
    statuses[0] ??
    schema.find(
      (property) => property.type === 'select' && /^(status|statut|état)$/i.test(property.name)
    ) ??
    null
  )
}

function findPriorityProperty(schema: NotionSchemaProperty[]): NotionSchemaProperty | null {
  return (
    schema.find(
      (property) =>
        (property.type === 'select' || property.type === 'status') &&
        /^priorit(y|é)$/i.test(property.name)
    ) ?? null
  )
}

function readOption(
  page: NotionFetchedPage,
  property: NotionSchemaProperty | null
): NotionPropertyOption | null {
  const value = property ? page.properties[property.name] : null
  if (typeof value !== 'string' || !value) {
    return null
  }
  const option = property?.options.find((candidate) => candidate.name === value)
  return { name: value, color: option?.color ?? 'default' }
}

export function buildTicketSummary(
  id: string,
  page: NotionFetchedPage,
  schema: NotionSchemaProperty[]
): NotionTicketSummary {
  const statusProperty = findStatusProperty(schema)
  const status = readOption(page, statusProperty)
  return {
    id,
    title: page.title,
    url: page.url,
    status: status && statusProperty ? { ...status, propertyName: statusProperty.name } : null,
    priority: readOption(page, findPriorityProperty(schema)),
    statusOptions: statusProperty?.options ?? []
  }
}

export async function getNotionTicket(rawId: string): Promise<NotionTicketSummary> {
  const id = normalizeNotionId(rawId)
  const page = await fetchPage(id)
  return buildTicketSummary(id, page, await getSchema(page.dataSourceUrl))
}

export async function getNotionTicketDetail(rawId: string): Promise<NotionTicketDetail> {
  const id = normalizeNotionId(rawId)
  const [page, commentsText] = await Promise.all([
    fetchPage(id),
    notionMcpConnection.callTool('get-comments', { page_id: id, include_all_blocks: true })
  ])
  return {
    ticket: buildTicketSummary(id, page, await getSchema(page.dataSourceUrl)),
    content: notionMarkupToMarkdown(page.content),
    rawContent: page.content,
    discussions: parseDiscussions(commentsText)
  }
}

export async function createNotionTicketComment(
  rawId: string,
  markdown: string,
  target: NotionCommentTarget
): Promise<void> {
  const body = markdown.trim()
  if (!body) {
    throw new Error('Comment is empty.')
  }
  await notionMcpConnection.callTool('create-comment', {
    page_id: normalizeNotionId(rawId),
    markdown: body,
    ...(target.kind === 'selection' ? { selection_with_ellipsis: target.selection } : {}),
    ...(target.kind === 'reply' ? { discussion_id: target.discussionId } : {})
  })
}

/** Applies an edit made against `baseContent`, refusing if the page changed meanwhile. */
export async function updateNotionTicketContent(
  rawId: string,
  baseContent: string,
  content: string
): Promise<void> {
  const id = normalizeNotionId(rawId)
  const current = await fetchPage(id)
  if (stripVolatileUrlSignatures(current.content) !== stripVolatileUrlSignatures(baseContent)) {
    throw new Error('This ticket changed in Notion while you were editing. Refresh and edit again.')
  }
  const updates = computeNotionContentUpdates(baseContent, content)
  if (updates.length === 0) {
    return
  }
  await notionMcpConnection.callTool('update-page', {
    page_id: id,
    command: 'update_content',
    content_updates: updates,
    allow_async: false
  })
}

export async function updateNotionTicketStatus(
  rawId: string,
  statusName: string
): Promise<NotionTicketSummary> {
  const id = normalizeNotionId(rawId)
  const page = await fetchPage(id)
  const schema = await getSchema(page.dataSourceUrl)
  const statusProperty = findStatusProperty(schema)
  if (!statusProperty) {
    throw new Error('This ticket has no status property.')
  }
  await notionMcpConnection.callTool('update-page', {
    page_id: id,
    command: 'update_properties',
    properties: { [statusProperty.name]: statusName },
    allow_async: false
  })
  return buildTicketSummary(
    id,
    { ...page, properties: { ...page.properties, [statusProperty.name]: statusName } },
    schema
  )
}
