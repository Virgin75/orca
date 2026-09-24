import React from 'react'
import { ChevronDown, LoaderCircle, UserRound } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import { ReviewerPicker } from '../pull-request-page/reviewers/picker'
import { useReviewerPickerState } from '../pull-request-page/reviewers/use-reviewer-picker-state'

/** Requested reviewers of the workspace PR, editable from the shared reviewer picker. */
export function WorkspaceHeaderReviewers({
  item,
  repoPath,
  onReviewersChanged
}: {
  item: GitHubWorkItem
  repoPath: string
  onReviewersChanged: (patch: Partial<GitHubWorkItem>) => void
}): React.JSX.Element {
  const { pickerProps, reviewers, submitting, canRequestReview } = useReviewerPickerState({
    item,
    repoPath,
    onReviewersRequested: (reviewRequests) => onReviewersChanged({ reviewRequests })
  })
  const names = reviewers.map((reviewer) => reviewer.name?.trim() || reviewer.login)
  const label =
    names.length > 0
      ? translate('auto.components.workspaceHeader.reviewerNames', 'Reviewer: {{value0}}', {
          value0: names.join(', ')
        })
      : translate('auto.components.workspaceHeader.addReviewer', 'Add reviewer')

  return (
    <ReviewerPicker
      {...pickerProps}
      align="start"
      trigger={
        <button
          type="button"
          disabled={submitting || !canRequestReview}
          aria-label={translate('auto.components.workspaceHeader.editReviewers', 'Edit reviewers')}
          className="flex min-w-0 items-center gap-1 rounded px-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {submitting ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin" />
          ) : (
            <UserRound className="size-3 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" />
        </button>
      }
    />
  )
}
