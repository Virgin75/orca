import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'

/** Where a test env repo runs: an existing directory, or a workspace created at launch. */
export type TestEnvironmentDirectoryChoice =
  | { kind: 'path'; path: string }
  | { kind: 'new-workspace' }

export const NEW_WORKSPACE_OPTION_VALUE = 'new-workspace'

export type TestEnvironmentDirectoryOption = { value: string; label: string }

export type TestEnvironmentRepoDirectories = {
  options: TestEnvironmentDirectoryOption[]
  defaultValue: string | null
  /** Why a repo cannot run from this workspace (e.g. it lives on another host). */
  unavailableReason: string | null
}

function branchName(branch: string | undefined): string {
  return (branch ?? '').replace(/^refs\/heads\//, '')
}

export function directoryChoiceFromValue(value: string): TestEnvironmentDirectoryChoice {
  return value === NEW_WORKSPACE_OPTION_VALUE
    ? { kind: 'new-workspace' }
    : { kind: 'path', path: value }
}

/**
 * Pickable directories for one test env repo: its Orca worktrees (never the
 * main checkout), plus a new worktree from the default base. Defaults to the
 * current workspace for its own repo and to a new worktree for the others.
 */
export function resolveTestEnvironmentRepoDirectories(args: {
  repoId: string
  repo: Repo | undefined
  currentWorktree: Worktree
  currentRepo: Repo | null | undefined
  worktrees: readonly Worktree[] | undefined
}): TestEnvironmentRepoDirectories {
  const { repoId, repo, currentWorktree, currentRepo, worktrees } = args
  if (!repo) {
    return {
      options: [],
      defaultValue: null,
      unavailableReason: translate(
        'auto.lib.testEnvironmentDirectories.repoRemoved',
        'Repository was removed.'
      )
    }
  }
  // Why: every pane runs on the workspace's host, so another host's paths do not exist there.
  if ((repo.connectionId ?? null) !== (currentRepo?.connectionId ?? null)) {
    return {
      options: [],
      defaultValue: null,
      unavailableReason: translate(
        'auto.lib.testEnvironmentDirectories.otherHost',
        'Lives on a different host than this workspace.'
      )
    }
  }
  const isCurrentRepo = repoId === currentWorktree.repoId
  // Why: a test env must never run against the shared main checkout, only a dedicated worktree.
  const live = (worktrees ?? []).filter(
    (worktree) =>
      !worktree.isArchived &&
      !worktree.isBare &&
      !worktree.isMainWorktree &&
      worktree.path !== repo.path &&
      worktree.path !== currentWorktree.path
  )
  if (isCurrentRepo) {
    live.unshift(currentWorktree)
  }
  const options: TestEnvironmentDirectoryOption[] = live.map((worktree) => ({
    value: worktree.path,
    label: worktree.displayName || branchName(worktree.branch) || worktree.path
  }))
  options.push({
    value: NEW_WORKSPACE_OPTION_VALUE,
    label: translate(
      'auto.lib.testEnvironmentDirectories.newWorktree',
      'New worktree from {{value0}}',
      { value0: repo.worktreeBaseRef || 'origin/main' }
    )
  })
  return {
    options,
    defaultValue: isCurrentRepo ? currentWorktree.path : NEW_WORKSPACE_OPTION_VALUE,
    unavailableReason: null
  }
}
