import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NotionLinkedTicket } from '../../shared/notion-types'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

// Why: kept beside the desktop's Notion session rather than in worktree metadata, because
// the Notion bridge only runs on this machine and remote hosts never read these links.
type LinksFile = {
  version: 1
  links: Record<string, NotionLinkedTicket[]>
}

let cache: LinksFile | null = null

function getLinksPath(): string {
  return join(homedir(), '.orca', 'notion-workspace-links.json')
}

function isLinkedTicket(value: unknown): value is NotionLinkedTicket {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'url' in value &&
    typeof value.url === 'string'
  )
}

function load(): LinksFile {
  if (cache) {
    return cache
  }
  const empty: LinksFile = { version: 1, links: {} }
  const path = getLinksPath()
  if (!existsSync(path)) {
    cache = empty
    return cache
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    const rawLinks =
      typeof parsed === 'object' && parsed !== null && 'links' in parsed ? parsed.links : null
    const links: Record<string, NotionLinkedTicket[]> = {}
    if (typeof rawLinks === 'object' && rawLinks !== null) {
      for (const [worktreeId, tickets] of Object.entries(rawLinks)) {
        if (Array.isArray(tickets)) {
          links[worktreeId] = tickets.filter(isLinkedTicket)
        }
      }
    }
    cache = { version: 1, links }
  } catch {
    cache = empty
  }
  return cache
}

function save(next: LinksFile): void {
  const path = getLinksPath()
  mkdirSync(join(homedir(), '.orca'), { recursive: true })
  writeFileDurableSync(durableWriteTempPath(path), path, JSON.stringify(next, null, 2))
  cache = next
}

export function getNotionWorkspaceLinks(worktreeId: string): NotionLinkedTicket[] {
  return load().links[worktreeId] ?? []
}

export function setNotionWorkspaceLinks(
  worktreeId: string,
  tickets: NotionLinkedTicket[]
): NotionLinkedTicket[] {
  const current = load()
  const deduped = tickets.filter(
    (ticket, index) => tickets.findIndex((other) => other.id === ticket.id) === index
  )
  const links = { ...current.links }
  if (deduped.length === 0) {
    delete links[worktreeId]
  } else {
    links[worktreeId] = deduped
  }
  save({ version: 1, links })
  return deduped
}
