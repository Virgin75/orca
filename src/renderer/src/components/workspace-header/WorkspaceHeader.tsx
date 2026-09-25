import React, { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { GitBranch, Github, Gitlab, GitPullRequest } from 'lucide-react'
import { useAppStore } from '@/store'
import { useRepoById, useWorktreeById } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'
import { getProviderChecksLabel } from '../../../../shared/provider-check-summary'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { useWorktreeCardReviewDetails } from '../sidebar/use-worktree-card-review-details'
import { getProviderName, getReviewLabel, ReviewIcon } from '../sidebar/worktree-review-helpers'
import { WorkspaceHeaderSourceBadge } from './WorkspaceHeaderSourceBadge'
import { getChecksTextTone } from '../task-page-checks-pill'
import { ChecksPanelReviewLabels } from '../right-sidebar/checks-panel/review-labels'
import { refreshHostedReviewCard } from '@/store/slices/hosted-review-card-refresh'
import { useWorkspacePRWorkItem } from './use-workspace-pr-work-item'
import { useWorkspacePRPendingComments } from './use-workspace-pr-pending-comments'
import { WorkspaceHeaderReviewers } from './WorkspaceHeaderReviewers'
import { useHeaderRefreshTick } from './use-header-refresh-tick'
import { useRepoLabelColors } from './use-repo-label-colors'

// Why: ~3 GitHub calls per tick, only for the visible workspace — well inside the rate limit.
const PR_REFRESH_INTERVAL_MS = 2 * 60_000
import { WorkspaceNotionTicketsBar } from '../notion/WorkspaceNotionTicketsBar'

/** Workspace header above every tab group: Notion tickets, then review context. */
export function WorkspaceHeader({
  worktreeId,
  isWorktreeActive
}: {
  worktreeId: string
  isWorktreeActive: boolean
}): React.JSX.Element | null {
  const worktree = useWorktreeById(worktreeId)
  const repo = useRepoById(worktree?.repoId ?? null)
  if (!worktree) {
    return null
  }
  return (
    <WorkspaceHeaderContent
      worktree={worktree}
      repo={repo ?? undefined}
      isWorktreeActive={isWorktreeActive}
    />
  )
}

function WorkspaceHeaderContent({
  worktree,
  repo,
  isWorktreeActive
}: {
  worktree: Worktree
  repo: Repo | undefined
  isWorktreeActive: boolean
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const cardProps = useAppStore((s) => s.worktreeCardProperties)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen)
  const setRightSidebarOpen = useAppStore((s) => s.setRightSidebarOpen)
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab)
  const fetchHostedReviewForBranch = useAppStore((s) => s.fetchHostedReviewForBranch)
  const { branch, detachedHeadDisplay, prDisplay } = useWorktreeCardReviewDetails({
    worktree,
    repo,
    settings,
    projectGroups,
    cardProps,
    newCardStyle: false
  })
  const isGitHubPR = prDisplay?.provider === 'github'
  const refreshTick = useHeaderRefreshTick(
    isWorktreeActive && Boolean(repo && branch),
    PR_REFRESH_INTERVAL_MS
  )
  const headSha = prDisplay && 'headSha' in prDisplay ? prDisplay.headSha : undefined
  const freshnessKey = `${headSha ?? ''}:${prDisplay?.status ?? ''}:${prDisplay?.state ?? ''}:${refreshTick}`
  const { item, patchItem } = useWorkspacePRWorkItem({
    repo: repo ?? null,
    prNumber: isGitHubPR ? prDisplay.number : null,
    freshnessKey,
    enabled: isWorktreeActive
  })
  const pendingComments = useWorkspacePRPendingComments({
    repo: repo ?? null,
    branch,
    prNumber: isGitHubPR ? prDisplay.number : null,
    freshnessKey,
    refreshTick,
    enabled: isWorktreeActive
  })
  const labelColors = useRepoLabelColors(repo ?? null, isWorktreeActive && isGitHubPR, refreshTick)
  const checksSummary = item?.number === prDisplay?.number ? item?.checksSummary : undefined
  const branchLabel = branch || detachedHeadDisplay?.sidebarLabel || ''
  const reviewUrl = prDisplay?.url

  const openReview = useCallback((): void => {
    if (!reviewUrl) {
      return
    }
    void openWorkspaceBrowserTab({
      workspaceId: worktree.id,
      url: reviewUrl,
      intent: { kind: 'url' }
    }).catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : translate('auto.lib.workspace.browser.tab.open.urlFailed', 'Unable to open URL.')
      )
    })
  }, [reviewUrl, worktree.id])

  const refreshReview = useCallback(
    async (admissionTier?: 'background'): Promise<void> => {
      if (!repo || !branch) {
        return
      }
      await refreshHostedReviewCard(fetchHostedReviewForBranch, {
        repoPath: repo.path,
        repoId: repo.id,
        branch,
        admissionTier,
        linkedGitHubPR: worktree.linkedPR,
        fallbackGitHubPR: prDisplay?.number ?? null
      })
    },
    [branch, fetchHostedReviewForBranch, prDisplay?.number, repo, worktree.linkedPR]
  )
  const refreshReviewAfterLabelEdit = useCallback(() => refreshReview(), [refreshReview])

  const refreshReviewRef = useRef(refreshReview)
  useEffect(() => {
    refreshReviewRef.current = refreshReview
  }, [refreshReview])
  // Periodic refresh: PR title/state/labels come from the hosted-review card, not the work item.
  useEffect(() => {
    if (refreshTick > 0) {
      void refreshReviewRef.current('background').catch((error: unknown) => {
        console.warn('[workspace-header] PR refresh failed', error)
      })
    }
  }, [refreshTick])

  const openChecks = useCallback((): void => {
    setRightSidebarOpen(true)
    setRightSidebarTab('checks')
  }, [setRightSidebarOpen, setRightSidebarTab])

  return (
    <div
      className="flex shrink-0 border-b border-border bg-card"
      data-terminal-focus-release-surface="true"
      data-workspace-header-id={worktree.id}
    >
      {/* Why: no-drag spacers keep the floating sidebar toggles clickable over this drag region. */}
      {!sidebarOpen ? (
        <div
          className="workspace-header-no-drag shrink-0"
          style={{ width: 'var(--collapsed-sidebar-header-width)' }}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-1">
        <WorkspaceNotionTicketsBar worktreeId={worktree.id} isWorktreeActive={isWorktreeActive} />
        <div className="flex h-5 min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground">
          {prDisplay ? (
            <WorkspaceHeaderSourceBadge
              icon={<ProviderIcon provider={prDisplay.provider} />}
              label={getProviderName(prDisplay)}
            />
          ) : null}
          {prDisplay ? (
            <button
              type="button"
              disabled={!reviewUrl}
              onClick={openReview}
              aria-label={translate(
                'auto.components.workspaceHeader.openReview',
                'Open {{value0}} #{{value1}}',
                {
                  value0: getReviewLabel(prDisplay),
                  value1: prDisplay.number
                }
              )}
              className="workspace-header-no-drag flex shrink-0 items-center gap-1 rounded px-1 font-medium text-foreground transition hover:bg-accent disabled:pointer-events-none"
            >
              <ReviewIcon review={prDisplay} variant="generic" className="size-3.5" />
              <span>
                {getReviewLabel(prDisplay)} #{prDisplay.number}
              </span>
            </button>
          ) : null}
          {branchLabel ? (
            <span
              className="flex min-w-3 max-w-fit flex-1 basis-0 items-center gap-1 overflow-hidden font-mono"
              title={translate('auto.components.workspaceHeader.branch', 'Branch')}
            >
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{branchLabel}</span>
            </span>
          ) : null}
          {isGitHubPR && repo && reviewUrl ? (
            <div className="workspace-header-no-drag flex min-w-0 shrink-[2] overflow-hidden">
              <ChecksPanelReviewLabels
                review={{
                  number: prDisplay.number,
                  url: reviewUrl,
                  // Why: the branch review may predate label support; the PR lookup always has them.
                  labels:
                    ('labels' in prDisplay ? prDisplay.labels : undefined) ??
                    (item?.number === prDisplay.number ? item.labels : undefined)
                }}
                repo={repo}
                labelColors={labelColors}
                onMutated={refreshReviewAfterLabelEdit}
              />
            </div>
          ) : null}
          {prDisplay && checksSummary ? (
            <button
              type="button"
              onClick={openChecks}
              title={getProviderChecksLabel(checksSummary)}
              aria-label={translate('auto.components.workspaceHeader.openChecks', 'Show checks')}
              className={cn(
                'workspace-header-no-drag shrink-0 rounded px-1 font-medium tabular-nums transition hover:bg-accent',
                getChecksTextTone({ checksSummary })
              )}
            >
              {translate(
                'auto.components.workspaceHeader.checksCount',
                '{{value0}}/{{value1}} checks',
                {
                  value0: checksSummary.passed,
                  value1: checksSummary.total
                }
              )}
            </button>
          ) : null}
          {pendingComments ? (
            <button
              type="button"
              onClick={openChecks}
              className="workspace-header-no-drag min-w-0 truncate rounded px-1 font-medium text-destructive transition hover:bg-accent"
            >
              {pendingComments === 1
                ? translate('auto.components.workspaceHeader.pendingComment', '1 pending comment')
                : translate(
                    'auto.components.workspaceHeader.pendingComments',
                    '{{value0}} pending comments',
                    { value0: pendingComments }
                  )}
            </button>
          ) : null}
          {isGitHubPR && item && repo && item.number === prDisplay.number ? (
            <div className="workspace-header-no-drag flex min-w-0 shrink">
              <WorkspaceHeaderReviewers
                item={item}
                repoPath={repo.path}
                onReviewersChanged={patchItem}
              />
            </div>
          ) : null}
        </div>
      </div>
      {!rightSidebarOpen ? (
        <div
          className="workspace-header-no-drag shrink-0"
          style={{ width: 'calc(40px + var(--window-controls-width, 0px))' }}
        />
      ) : null}
    </div>
  )
}

function ProviderIcon({ provider }: { provider: string }): React.JSX.Element {
  if (provider === 'github') {
    return <Github />
  }
  if (provider === 'gitlab') {
    return <Gitlab />
  }
  return <GitPullRequest />
}
