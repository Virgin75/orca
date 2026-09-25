import React from 'react'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { GitHubAssignableUser } from '../../../../../shared/github/pull-request-types'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import { translate } from '@/i18n/i18n'
import type { PullRequestPageProjectOrigin } from '../page-types'
import { ReviewerPicker } from './picker'
import { ReviewerRequestedList } from './requested-list'
import { useReviewerPickerState } from './use-reviewer-picker-state'

export function PRReviewersPanel({
  item,
  loading,
  repoPath,
  sourceContext,
  projectOrigin,
  onReviewersRequested
}: {
  item: GitHubWorkItem
  loading: boolean
  repoPath: string | null
  sourceContext?: TaskSourceContext | null
  projectOrigin?: PullRequestPageProjectOrigin
  onReviewersRequested: (reviewRequests: GitHubAssignableUser[]) => void
}): React.JSX.Element {
  const {
    pickerProps,
    reviewers,
    hasReviewerMetadata,
    selectedReviewerLogins,
    submitting,
    canRequestReview,
    handleRemoveReviewers
  } = useReviewerPickerState({
    item,
    repoPath,
    sourceContext,
    projectOrigin,
    onReviewersRequested
  })

  return (
    <section>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <span>{translate('auto.components.PullRequestPage.00d3be6bcd', 'Reviewers')}</span>
        <ReviewerPicker {...pickerProps} />
      </div>
      <ReviewerRequestedList
        reviewers={reviewers}
        loading={loading}
        hasReviewerMetadata={hasReviewerMetadata}
        selectedReviewerLogins={selectedReviewerLogins}
        submitting={submitting}
        canRequestReview={canRequestReview}
        onRemove={(login) => {
          void handleRemoveReviewers([login])
        }}
      />
    </section>
  )
}
