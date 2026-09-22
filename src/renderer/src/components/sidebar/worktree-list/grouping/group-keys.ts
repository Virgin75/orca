import { CircleX, FolderTree, List, Pin } from 'lucide-react'
import type React from 'react'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { branchName } from '../../../../lib/git-utils'
import {
  ConductorDoneIcon,
  ConductorProgressIcon,
  ConductorReviewIcon
} from '../../workspace-status-icons'
import { UNGROUPED_PROJECT_GROUP_KEY } from '../../../../../../shared/project-groups'
import type { AppState } from '../../../../store/types'
import {
  getGitHubPRCacheKey,
  getLegacyGitHubPRCacheKey
} from '../../../../store/slices/github-cache-key'
import { translate } from '@/i18n/i18n'
import { isGitHubPRSuppressed } from '../../../../../../shared/worktree/github-pr-suppression'

export type PRGroupKey = 'done' | 'in-review' | 'in-progress' | 'closed'

export const PR_GROUP_ORDER: PRGroupKey[] = ['done', 'in-review', 'in-progress', 'closed']

/** Section key for a PR lane. Shared so worktree and folder-workspace bucketing
 *  cannot drift onto different prefixes. */
export function getPRLaneKey(prGroup: PRGroupKey): string {
  return `pr:${prGroup}`
}

/** Checked inverse of getPRLaneKey; unknown keys fall back to the no-PR lane. */
export function getPRGroupKeyFromLaneKey(key: string): PRGroupKey {
  return PR_GROUP_ORDER.find((group) => getPRLaneKey(group) === key) ?? 'in-progress'
}

export const PR_GROUP_META: Record<
  PRGroupKey,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    tone: string
  }
> = {
  done: {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.5076efc3d2', 'Done')
    },
    icon: ConductorDoneIcon,
    tone: 'text-workspace-status-done'
  },
  'in-review': {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.6798dc7c94', 'In review')
    },
    icon: ConductorReviewIcon,
    tone: 'text-workspace-status-review'
  },
  'in-progress': {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.7c2f009786', 'In progress')
    },
    icon: ConductorProgressIcon,
    tone: 'text-workspace-status-progress'
  },
  closed: {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.682ed5d551', 'Closed')
    },
    icon: CircleX,
    tone: 'text-zinc-600 dark:text-zinc-300'
  }
}

export const PROJECT_GROUP_META = {
  tone: 'text-foreground',
  icon: FolderTree
} as const

export function getProjectGroupHeaderKey(groupId: string | null): string {
  return groupId ? `project-group:${groupId}` : UNGROUPED_PROJECT_GROUP_KEY
}

export const PINNED_GROUP_KEY = 'pinned'

export const PINNED_GROUP_META = {
  get label() {
    return translate('auto.components.sidebar.worktree.list.groups.4aeefc5996', 'Pinned')
  },
  tone: 'text-foreground',
  icon: Pin
} as const

export const ALL_GROUP_KEY = 'all'

export const ALL_GROUP_META = {
  get label() {
    return translate('auto.components.sidebar.worktree.list.groups.0ed04075b8', 'All')
  },
  tone: 'text-foreground',
  icon: List
} as const

export const LINEAGE_GROUP_PREFIX = 'lineage:'

export function getLineageGroupKey(worktreeId: string): string {
  return `${LINEAGE_GROUP_PREFIX}${worktreeId}`
}

export function getWorktreeLineageGroupKey(worktree: Pick<Worktree, 'id' | 'hostId'>): string {
  return getLineageGroupKey(worktree.hostId ? getWorktreeHostIdentity(worktree) : worktree.id)
}

type CachedWorktreePR = { number?: number; state?: string; labels?: string[] }

function readCachedPRField(value: object, key: string): unknown {
  return key in value ? Reflect.get(value, key) : undefined
}

/** `undefined` = no cache entry (try the next key); `null` = entry without PR data. */
function readCachedPREntry(
  prCache: Record<string, unknown>,
  key: string
): CachedWorktreePR | null | undefined {
  const entry = prCache[key]
  if (typeof entry !== 'object' || entry === null) {
    return undefined
  }
  const data = readCachedPRField(entry, 'data')
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const number = readCachedPRField(data, 'number')
  const state = readCachedPRField(data, 'state')
  const labels = readCachedPRField(data, 'labels')
  return {
    ...(typeof number === 'number' ? { number } : {}),
    ...(typeof state === 'string' ? { state } : {}),
    ...(Array.isArray(labels)
      ? { labels: labels.filter((label): label is string => typeof label === 'string') }
      : {})
  }
}

/** The worktree's cached PR, or undefined when none is known or it is suppressed. */
export function getWorktreeCachedPR(
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  prCache: Record<string, unknown> | null,
  settings?: AppState['settings']
): CachedWorktreePR | undefined {
  const repo = repoMap.get(worktree.repoId)
  const branch = branchName(worktree.branch)
  if (!prCache || !repo || !branch) {
    return undefined
  }
  const repoScopedCacheKey = getGitHubPRCacheKey(
    repo.path,
    repo.id,
    branch,
    settings,
    repo.connectionId,
    repo.executionHostId,
    true
  )
  const canUseLegacyPRCache = !repo.connectionId && !repo.executionHostId
  // Why: PR refreshes now write repo-id scoped entries; legacy path entries may
  // still exist from persisted cache, but must not override fresher repo data.
  let pr = readCachedPREntry(prCache, repoScopedCacheKey)
  if (pr === undefined && canUseLegacyPRCache) {
    pr =
      readCachedPREntry(prCache, getLegacyGitHubPRCacheKey(repo.path, repo.id, branch)) ??
      readCachedPREntry(prCache, getLegacyGitHubPRCacheKey(repo.path, undefined, branch))
  }
  if (!pr || (typeof pr.number === 'number' && isGitHubPRSuppressed(worktree, pr.number))) {
    return undefined
  }
  return pr
}

export function getPRGroupKey(
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  prCache: Record<string, unknown> | null,
  settings?: AppState['settings']
): PRGroupKey {
  const pr = getWorktreeCachedPR(worktree, repoMap, prCache, settings)
  if (!pr) {
    return 'in-progress'
  }
  if (pr.state === 'merged') {
    return 'done'
  }
  if (pr.state === 'closed') {
    return 'closed'
  }
  if (pr.state === 'draft') {
    return 'in-progress'
  }
  return 'in-review'
}

/**
 * Emit a "Pinned" header + its items into `result`.
 *
 * Why: the dedicated Pinned section is always present for pinned worktrees;
 * the display policy decides whether their natural group rows also render.
 */
