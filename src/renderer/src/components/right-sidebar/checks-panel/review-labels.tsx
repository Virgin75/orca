import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useImmediateMutation, useRepoLabels } from '@/hooks/useIssueMetadata'
import { getSettingsForRepoRuntimeOwner } from '@/lib/repo-runtime-owner'
import { runIssueUpdate } from '@/components/github/github-work-item-edit-mutations'
import { GHEditSectionLabelsPill } from '@/components/github-item-dialog/edit-item-fields/gh-edit-section-labels'
import { getGitHubRepositoryLabelsUrl } from '@/components/github-item-dialog/edit-item-fields/repository-labels-url'
import type { ChecksPanelReview } from '../checks-panel-review'

const EMPTY_LABELS: string[] = []

export function toggleReviewLabel(labels: readonly string[], label: string): string[] {
  return labels.includes(label) ? labels.filter((name) => name !== label) : [...labels, label]
}

/** GitHub PR labels with an inline add/remove picker. PRs are issues to GitHub,
 *  so edits reuse the issue-update route (SSH, runtime, and web aware). */
export function ChecksPanelReviewLabels({
  review,
  repo,
  onMutated
}: {
  review: ChecksPanelReview
  repo: { id: string; path: string }
  onMutated: () => Promise<void> | void
}): React.JSX.Element {
  const reviewLabels = review.labels ?? EMPTY_LABELS
  const [localLabels, setLocalLabels] = useState<string[]>(reviewLabels)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const { isPending, run } = useImmediateMutation()
  const repoOwnerSettings = useAppStore(
    useShallow((s) => getSettingsForRepoRuntimeOwner(s, repo.id))
  )
  const repoLabels = useRepoLabels(repo.path, repo.id, repoOwnerSettings)
  const repositoryLabelsUrl = useMemo(() => getGitHubRepositoryLabelsUrl(review.url), [review.url])

  const pending = isPending('labels')
  // Why: sync on content change only, so a successful edit keeps its optimistic
  // labels until the PR refresh lands instead of flashing the stale cache.
  const reviewLabelsKey = reviewLabels.join('\0')
  useEffect(() => {
    setLocalLabels(reviewLabelsKey === '' ? [] : reviewLabelsKey.split('\0'))
  }, [reviewLabelsKey])

  const handleToggle = (label: string): void => {
    const previous = localLabels
    const isAdding = !previous.includes(label)
    run('labels', {
      mutate: () =>
        runIssueUpdate({
          repoPath: repo.path,
          repoId: repo.id,
          projectOrigin: undefined,
          number: review.number,
          updates: isAdding ? { addLabels: [label] } : { removeLabels: [label] }
        }),
      onOptimistic: () => setLocalLabels(toggleReviewLabel(previous, label)),
      onRevert: () => setLocalLabels(previous),
      onSuccess: () => void onMutated(),
      onError: (error) => toast.error(error)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <GHEditSectionLabelsPill
        localLabels={localLabels}
        repoLabels={repoLabels}
        repositoryLabelsUrl={repositoryLabelsUrl}
        isPending={pending}
        popoverOpen={popoverOpen}
        onPopoverOpenChange={setPopoverOpen}
        onToggle={handleToggle}
      />
    </div>
  )
}
