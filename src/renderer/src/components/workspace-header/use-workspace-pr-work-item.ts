import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getSettingsForRepoRuntimeOwner } from '@/lib/repo-runtime-owner'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'

type Repo = { id: string; path: string }

// Why: keyed by head + rollup status so switching workspaces reuses the item and
// a push or check transition is the only thing that spends another `gh pr view`.
const workItemCache = new Map<string, GitHubWorkItem>()
const MAX_CACHED_ITEMS = 50

function rememberWorkItem(key: string, item: GitHubWorkItem): void {
  workItemCache.delete(key)
  workItemCache.set(key, item)
  if (workItemCache.size > MAX_CACHED_ITEMS) {
    const oldest = workItemCache.keys().next().value
    if (oldest !== undefined) {
      workItemCache.delete(oldest)
    }
  }
}

/** The GitHub PR work item (reviewers + checks summary) behind a workspace header. */
export function useWorkspacePRWorkItem({
  repo,
  prNumber,
  freshnessKey,
  enabled
}: {
  repo: Repo | null
  prNumber: number | null
  freshnessKey: string
  enabled: boolean
}): {
  item: GitHubWorkItem | null
  patchItem: (patch: Partial<GitHubWorkItem>) => void
} {
  const ownerSettings = useAppStore(
    useShallow((s) => getSettingsForRepoRuntimeOwner(s, repo?.id ?? null))
  )
  const cacheKey = repo && prNumber ? `${repo.id}::${prNumber}::${freshnessKey}` : null
  const [loaded, setLoaded] = useState<{
    key: string
    item: GitHubWorkItem
  } | null>(null)
  const item =
    cacheKey === null
      ? null
      : loaded?.key === cacheKey
        ? loaded.item
        : (workItemCache.get(cacheKey) ??
          // Why: keep the previous item for this PR on screen while a refresh is in flight.
          (loaded?.item.number === prNumber && loaded.item.repoId === repo?.id
            ? loaded.item
            : null))

  useEffect(() => {
    if (!enabled || !repo || !prNumber || cacheKey === null) {
      return
    }
    const cached = workItemCache.get(cacheKey)
    if (cached) {
      setLoaded({ key: cacheKey, item: cached })
      return
    }
    let cancelled = false
    const target = getActiveRuntimeTarget(ownerSettings)
    const request =
      target.kind === 'environment'
        ? callRuntimeRpc<Omit<GitHubWorkItem, 'repoId'> | null>(
            target,
            'github.workItem',
            { repo: repo.id, number: prNumber, type: 'pr' },
            { timeoutMs: 30_000 }
          )
        : window.api.gh.workItem({
            repoPath: repo.path,
            repoId: repo.id,
            number: prNumber,
            type: 'pr'
          })
    void Promise.resolve(request)
      .then((result: Omit<GitHubWorkItem, 'repoId'> | null) => {
        if (cancelled || !result) {
          return
        }
        const next: GitHubWorkItem = { ...result, repoId: repo.id }
        rememberWorkItem(cacheKey, next)
        setLoaded({ key: cacheKey, item: next })
      })
      .catch((error: unknown) => {
        // Why: the header is ambient chrome; a failed lookup just hides reviewers/checks.
        console.warn('[workspace-header] PR lookup failed', error)
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, enabled, ownerSettings, prNumber, repo])

  const patchItem = useCallback(
    (patch: Partial<GitHubWorkItem>): void => {
      if (!item || cacheKey === null) {
        return
      }
      const next = { ...item, ...patch }
      rememberWorkItem(cacheKey, next)
      setLoaded({ key: cacheKey, item: next })
    },
    [cacheKey, item]
  )

  return { item, patchItem }
}
