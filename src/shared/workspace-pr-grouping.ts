import type { PersistedUIState } from './persisted-ui-state-types'

/** Sidebar groupings that bucket worktrees by their PR, so they need PR data kept fresh. */
export function isPullRequestGroupBy(groupBy: PersistedUIState['groupBy']): boolean {
  return groupBy === 'pr-status' || groupBy === 'pr-label'
}
