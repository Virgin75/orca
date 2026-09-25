import type {
  LanguageServerStatusEntry,
  LanguageServerStatusSnapshot
} from '../../../../shared/language-server-types'

export type LanguageServerSummaryState =
  | 'starting'
  | 'indexing'
  | 'ready'
  | 'error'
  | 'idle'
  | 'remote'

export type LanguageServerSummary = {
  state: LanguageServerSummaryState
  /** Servers for the active workspace. */
  servers: LanguageServerStatusEntry[]
  /** Running servers that belong to other workspaces. */
  otherCount: number
}

// Why: one bad server should be visible even while another is still loading.
const STATE_PRIORITY: LanguageServerStatusEntry['state'][] = [
  'error',
  'starting',
  'indexing',
  'ready'
]

export function summarizeLanguageServers(
  snapshot: LanguageServerStatusSnapshot,
  activeRootPath: string | null,
  activeWorkspaceIsLocal: boolean
): LanguageServerSummary {
  const servers = snapshot.servers.filter((server) => server.rootPath === activeRootPath)
  const otherCount = snapshot.servers.length - servers.length
  if (!activeWorkspaceIsLocal && activeRootPath) {
    return { state: 'remote', servers, otherCount }
  }
  const state = STATE_PRIORITY.find((candidate) => servers.some((s) => s.state === candidate))
  return { state: state ?? 'idle', servers, otherCount }
}
