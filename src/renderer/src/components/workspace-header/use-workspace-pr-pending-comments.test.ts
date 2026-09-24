import { describe, expect, it } from 'vitest'
import type { PRComment } from '../../../../shared/github/comment-types'
import { countPendingReviewThreads } from './use-workspace-pr-pending-comments'

function comment(id: number, patch: Partial<PRComment>): PRComment {
  return { id, author: 'a', authorAvatarUrl: '', body: '', createdAt: '', url: '', ...patch }
}

describe('countPendingReviewThreads', () => {
  it('counts each unresolved thread once and skips resolved and conversation comments', () => {
    expect(
      countPendingReviewThreads([
        comment(1, { threadId: 't1', isResolved: false }),
        comment(2, { threadId: 't1', isResolved: false }),
        comment(3, { threadId: 't2', isResolved: false }),
        comment(4, { threadId: 't3', isResolved: true }),
        comment(5, {})
      ])
    ).toBe(2)
  })

  it('is zero when every thread is resolved', () => {
    expect(countPendingReviewThreads([comment(1, { threadId: 't1', isResolved: true })])).toBe(0)
  })
})
