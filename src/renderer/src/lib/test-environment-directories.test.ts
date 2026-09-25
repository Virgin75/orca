import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import {
  NEW_WORKSPACE_OPTION_VALUE,
  directoryChoiceFromValue,
  resolveTestEnvironmentRepoDirectories
} from './test-environment-directories'

function worktree(overrides: Partial<Worktree>): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only the fields set here.
  return {
    id: 'w',
    repoId: 'app',
    path: '/w',
    branch: 'refs/heads/feat-x',
    displayName: '',
    isArchived: false,
    isBare: false,
    isMainWorktree: false,
    ...overrides
  } as Worktree
}

function repo(overrides: Partial<Repo>): Repo {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only the fields set here.
  return {
    id: 'api',
    path: '/api',
    displayName: 'api',
    connectionId: null,
    ...overrides
  } as Repo
}

describe('resolveTestEnvironmentRepoDirectories', () => {
  const current = worktree({
    id: 'app::/app-feat',
    repoId: 'app',
    path: '/app-feat'
  })

  it('defaults to the current workspace but still offers its siblings and a new workspace', () => {
    const result = resolveTestEnvironmentRepoDirectories({
      repoId: 'app',
      repo: repo({ id: 'app', path: '/app' }),
      currentWorktree: current,
      currentRepo: repo({ id: 'app' }),
      worktrees: [
        worktree({
          repoId: 'app',
          path: '/app',
          isMainWorktree: true,
          branch: 'refs/heads/main'
        }),
        current
      ]
    })
    expect(result.defaultValue).toBe('/app-feat')
    expect(result.options.map((option) => option.value)).toEqual([
      '/app',
      '/app-feat',
      NEW_WORKSPACE_OPTION_VALUE
    ])
  })

  it('prefers the other repo worktree on the same branch, then the main checkout', () => {
    const worktrees = [
      worktree({
        repoId: 'api',
        path: '/api',
        branch: 'refs/heads/main',
        isMainWorktree: true
      }),
      worktree({
        repoId: 'api',
        path: '/api-feat',
        branch: 'refs/heads/feat-x'
      })
    ]
    const sameBranch = resolveTestEnvironmentRepoDirectories({
      repoId: 'api',
      repo: repo({}),
      currentWorktree: current,
      currentRepo: repo({ id: 'app' }),
      worktrees
    })
    expect(sameBranch.defaultValue).toBe('/api-feat')

    const fallback = resolveTestEnvironmentRepoDirectories({
      repoId: 'api',
      repo: repo({}),
      currentWorktree: worktree({ ...current, branch: 'refs/heads/other' }),
      currentRepo: repo({ id: 'app' }),
      worktrees
    })
    expect(fallback.defaultValue).toBe('/api')
  })

  it('refuses a repo that lives on another host', () => {
    const result = resolveTestEnvironmentRepoDirectories({
      repoId: 'api',
      repo: repo({ connectionId: 'ssh-1' }),
      currentWorktree: current,
      currentRepo: repo({ id: 'app' }),
      worktrees: []
    })
    expect(result.defaultValue).toBeNull()
    expect(result.unavailableReason).toBeTruthy()
  })

  it('maps the new-workspace option to a create choice', () => {
    expect(directoryChoiceFromValue(NEW_WORKSPACE_OPTION_VALUE)).toEqual({
      kind: 'new-workspace'
    })
    expect(directoryChoiceFromValue('/api')).toEqual({
      kind: 'path',
      path: '/api'
    })
  })
})
