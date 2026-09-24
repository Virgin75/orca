import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { prCommentsCacheSuffix } from '@/store/github/cache-identity'
import { getGitHubPRCacheKey, getGitHubRepoCacheKey } from '@/store/slices/github-cache-key'
import type { PRComment } from '../../../../shared/github/comment-types'
import type { Repo } from '../../../../shared/repo-types'

/** Unresolved review threads; conversation comments have no resolution state, so they never count. */
export function countPendingReviewThreads(comments: readonly PRComment[]): number {
  const pending = new Set<string>()
  for (const comment of comments) {
    if (comment.threadId && comment.isResolved === false) {
      pending.add(comment.threadId)
    }
  }
  return pending.size
}

/** Pending review threads for the workspace PR, read from the same cache the Checks panel fills. */
export function useWorkspacePRPendingComments({
  repo,
  branch,
  prNumber,
  freshnessKey,
  enabled
}: {
  repo: Repo | null
  branch: string
  prNumber: number | null
  freshnessKey: string
  enabled: boolean
}): number | null {
  const settings = useAppStore((s) => s.settings)
  const fetchPRComments = useAppStore((s) => s.fetchPRComments)
  const prCacheKey =
    repo && branch
      ? getGitHubPRCacheKey(
          repo.path,
          repo.id,
          branch,
          settings,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  const prRepo = useAppStore((s) => (prCacheKey ? s.prCache[prCacheKey]?.data?.prRepo : undefined))
  const commentsCacheKey =
    repo && prNumber
      ? getGitHubRepoCacheKey(
          repo.path,
          repo.id,
          prCommentsCacheSuffix(prNumber, prRepo),
          settings,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  const comments = useAppStore((s) =>
    commentsCacheKey ? s.commentsCache[commentsCacheKey]?.data : undefined
  )

  useEffect(() => {
    if (!enabled || !repo || !prNumber) {
      return
    }
    // Why: the store action honours its TTL and dedupes in-flight requests with the Checks panel.
    void fetchPRComments(repo.path, prNumber, { repoId: repo.id, prRepo }).catch(
      (error: unknown) => {
        console.warn('[workspace-header] PR comments lookup failed', error)
      }
    )
  }, [enabled, fetchPRComments, freshnessKey, prNumber, prRepo, repo])

  return comments ? countPendingReviewThreads(comments) : null
}
