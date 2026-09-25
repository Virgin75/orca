import type {
  NotionDiscussion,
  NotionOptionColor,
  NotionPropertyOption,
  NotionTicketComment,
  NotionTicketSearchResult
} from '../../shared/notion-types'

const OPTION_COLORS: readonly NotionOptionColor[] = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red'
]

export type NotionFetchedPage = {
  title: string
  url: string
  properties: Record<string, unknown>
  dataSourceUrl: string | null
  content: string
}

export type NotionSchemaProperty = {
  name: string
  type: string
  options: NotionPropertyOption[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Tool text is usually a JSON envelope whose `text` field holds the XML-ish body. */
function unwrapText(text: string): string {
  const parsed = parseJson(text)
  return isRecord(parsed) && typeof parsed.text === 'string' ? parsed.text : text
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const DASHED_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Accepts a page id (dashed or not) or a Notion URL whose slug ends with the id. */
export function normalizeNotionId(value: string): string {
  const trimmed = value.trim()
  const dashed = trimmed.match(DASHED_UUID)?.[0]
  // Why: slugs can end in hex letters ("…-cafe-3e49…"), so read the id from the path's tail.
  const lastSegment = trimmed.split(/[?#]/)[0].split('/').at(-1) ?? ''
  const tail = lastSegment.replace(/-/g, '').slice(-32)
  const hex = dashed?.replace(/-/g, '') ?? (/^[0-9a-f]{32}$/i.test(tail) ? tail : null)
  if (!hex) {
    return trimmed
  }
  const h = hex.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function toOptionColor(value: unknown): NotionOptionColor {
  const color = readString(value)?.replace(/_background$/, '')
  return OPTION_COLORS.find((candidate) => candidate === color) ?? 'default'
}

export function parseSearchResults(text: string): NotionTicketSearchResult[] {
  const parsed = parseJson(text)
  const results = isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results : []
  const tickets: NotionTicketSearchResult[] = []
  for (const entry of results) {
    if (!isRecord(entry) || entry.type !== 'page') {
      continue
    }
    const id = readString(entry.id)
    const url = readString(entry.url)
    if (!id || !url) {
      continue
    }
    tickets.push({
      id: normalizeNotionId(id),
      title: readString(entry.title)?.trim() || 'Untitled',
      url: url.replace(/\?pvs=\d+$/, ''),
      timestamp: readString(entry.timestamp)
    })
  }
  return tickets
}

export function parseFetchedPage(text: string): NotionFetchedPage {
  const envelope = parseJson(text)
  const body = unwrapText(text)
  const pageTag = body.match(/<page\s+url="([^"]+)"/)
  const propertiesJson = body.match(/<properties>\s*([\s\S]*?)\s*<\/properties>/)?.[1]
  const properties = propertiesJson ? parseJson(propertiesJson) : null
  const content = body.match(/<content>\n?([\s\S]*?)\n?<\/content>/)?.[1] ?? ''
  const envelopeTitle = isRecord(envelope) ? readString(envelope.title) : null
  const envelopeUrl = isRecord(envelope) ? readString(envelope.url) : null
  return {
    title: envelopeTitle?.trim() || 'Untitled',
    url: (envelopeUrl ?? pageTag?.[1] ?? '').replace(/\?pvs=\d+$/, ''),
    properties: isRecord(properties) ? properties : {},
    dataSourceUrl: body.match(/<parent-data-source\s+url="([^"]+)"/)?.[1] ?? null,
    content
  }
}

function readOptions(value: unknown): NotionPropertyOption[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((option) => {
    const name = isRecord(option) ? readString(option.name) : null
    return name && isRecord(option) ? [{ name, color: toOptionColor(option.color) }] : []
  })
}

export function parseDataSourceSchema(text: string): NotionSchemaProperty[] {
  const body = unwrapText(text)
  const stateJson = body.match(/<data-source-state>\s*([\s\S]*?)\s*<\/data-source-state>/)?.[1]
  const state = stateJson ? parseJson(stateJson) : null
  const schema = isRecord(state) && isRecord(state.schema) ? state.schema : {}
  return Object.entries(schema).flatMap(([key, raw]) => {
    if (!isRecord(raw)) {
      return []
    }
    const type = readString(raw.type) ?? ''
    // Status options arrive bucketed by group (to-do / in progress / complete).
    const options = isRecord(raw.groups)
      ? Object.values(raw.groups).flatMap(readOptions)
      : readOptions(raw.options)
    return [{ name: readString(raw.name) ?? key, type, options }]
  })
}

function readAttr(attrs: string, name: string): string | null {
  const value = attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1]
  return value === undefined ? null : decodeEntities(value)
}

export function parseDiscussions(text: string): NotionDiscussion[] {
  const body = unwrapText(text)
  const pattern = /<discussion\s+([^>]*)>([\s\S]*?)<\/discussion>/g
  return [...body.matchAll(pattern)].flatMap((match) => {
    const id = readAttr(match[1], 'id')
    if (!id) {
      return []
    }
    return [
      {
        id,
        context: readAttr(match[1], 'context') ?? 'page',
        textContext: readAttr(match[1], 'text-context'),
        resolved: readAttr(match[1], 'resolved') === 'true',
        comments: parseComments(match[2])
      }
    ]
  })
}

export function parseComments(text: string): NotionTicketComment[] {
  const body = unwrapText(text)
  const comments: NotionTicketComment[] = []
  const pattern = /<comment\s+([^>]*)>([\s\S]*?)<\/comment>/g
  for (const match of body.matchAll(pattern)) {
    const attrs = match[1]
    const attr = (name: string): string | null => readAttr(attrs, name)
    const userUrl = attr('user-url')
    // user://<id>/<email> — the email is the only human-readable handle offered.
    const email = userUrl?.split('/').slice(3).join('/') || null
    comments.push({
      id: attr('id') ?? String(comments.length),
      author: email || null,
      createdAt: attr('datetime'),
      body: notionMarkupToMarkdown(match[2])
    })
  }
  return comments
}

/**
 * Rewrites `<span>` tags with a stack so nesting survives: discussion anchors become
 * `<mark data-discussions>` highlights, every other span (underline, color) is dropped.
 */
function rewriteSpans(markup: string): string {
  const stack: boolean[] = []
  return markup.replace(/<span\b([^>]*)>|<\/span>/g, (_tag, attrs: string | undefined) => {
    if (attrs === undefined) {
      return stack.pop() ? '</mark>' : ''
    }
    const discussions = readAttr(attrs, 'discussion-urls')
    stack.push(discussions !== null)
    return discussions === null
      ? ''
      : `<mark data-discussions="${discussions.replace(/[&"<>]/g, '')}">`
  })
}

/** Flattens Notion's enhanced-markdown tags into GFM that the ticket panel renders. */
export function notionMarkupToMarkdown(markup: string): string {
  return (
    rewriteSpans(markup)
      .replace(/<br\s*\/?>/g, '  \n')
      .replace(/<empty-block\s*\/>/g, '')
      .replace(/<mention-user[^>]*>([\s\S]*?)<\/mention-user>/g, (_m, name: string) =>
        name ? `@${name}` : '@user'
      )
      .replace(/<mention-page\s+url="([^"]+)"[^>]*>([\s\S]*?)<\/mention-page>/g, '[$2]($1)')
      .replace(/<page\s+url="([^"]+)"[^>]*>([\s\S]*?)<\/page>/g, '[$2]($1)')
      .replace(/<mention-date\s+start="([^"]+)"[^>]*\/?>(<\/mention-date>)?/g, '$1')
      .replace(/<callout[^>]*>([\s\S]*?)<\/callout>/g, (_m, inner: string) =>
        inner
          .split('\n')
          .map((line) => `> ${line.replace(/^\t/, '')}`)
          .join('\n')
      )
      .replace(
        /<\/?(details|summary|columns|column|toggle|synced_block_reference|synced_block)[^>]*>/g,
        ''
      )
      .replace(/\s\{(toggle|color)="[^"]*"[^}]*\}/g, '')
      // Why: Notion indents nested blocks with tabs, which Markdown would render as code.
      .replace(
        /^(>?\s?)(\t+)/gm,
        (_m, prefix: string, tabs: string) => `${prefix}${'  '.repeat(tabs.length)}`
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
