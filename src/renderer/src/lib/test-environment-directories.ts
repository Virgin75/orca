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
 * Pickable directories for one test env repo: its Orca workspaces, plus a new
 * workspace from the default base. Defaults to the current workspace for its
 * own repo, otherwise the workspace on the same branch, then the main checkout.
 */
export function resolveTestEnvironmentRepoDirectories(args: {
  repoId: string
  repo: Repo | undefined
  currentWorktree: Worktree
  currentRepo: Repo | null | undefined
  worktrees: readonly Worktree[] | undefined
}): TestEnvironmentRepoDirectories {
  const { repoId, repo, currentWorktree, currentRepo, worktrees } = args
  const newWorkspaceBase = (repo?.worktreeBaseRef ?? 'main').replace(/^origin\//, '')
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
  const live = (worktrees ?? []).filter((worktree) => !worktree.isArchived && !worktree.isBare)
  if (repoId === currentWorktree.repoId && !live.some((w) => w.path === currentWorktree.path)) {
    live.unshift(currentWorktree)
  }
  const options: TestEnvironmentDirectoryOption[] = live.map((worktree) => ({
    value: worktree.path,
    label: worktree.displayName || branchName(worktree.branch) || worktree.path
  }))
  if (!options.some((option) => option.value === repo.path)) {
    options.push({ value: repo.path, label: repo.displayName })
  }
  options.push({
    value: NEW_WORKSPACE_OPTION_VALUE,
    label: translate(
      'auto.lib.testEnvironmentDirectories.newWorkspace',
      'New workspace from {{value0}}',
      { value0: newWorkspaceBase }
    )
  })

  let defaultPath: string
  if (repoId === currentWorktree.repoId) {
    defaultPath = currentWorktree.path
  } else {
    const currentBranch = branchName(currentWorktree.branch)
    const sameBranch = currentBranch
      ? live.find((worktree) => branchName(worktree.branch) === currentBranch)
      : undefined
    const main = live.find((worktree) => worktree.isMainWorktree)
    defaultPath = sameBranch?.path ?? main?.path ?? repo.path
  }
  return { options, defaultValue: defaultPath, unavailableReason: null }
}
