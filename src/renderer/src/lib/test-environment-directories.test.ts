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

  it('defaults to the current workspace and never offers the main checkout', () => {
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
        current,
        worktree({
          repoId: 'app',
          path: '/app-other',
          branch: 'refs/heads/other'
        })
      ]
    })
    expect(result.defaultValue).toBe('/app-feat')
    expect(result.options.map((option) => option.value)).toEqual([
      '/app-feat',
      '/app-other',
      NEW_WORKSPACE_OPTION_VALUE
    ])
  })

  it('defaults other repos to a new worktree from their base ref', () => {
    const result = resolveTestEnvironmentRepoDirectories({
      repoId: 'api',
      repo: repo({}),
      currentWorktree: current,
      currentRepo: repo({ id: 'app' }),
      worktrees: [
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
    })
    expect(result.defaultValue).toBe(NEW_WORKSPACE_OPTION_VALUE)
    expect(result.options.map((option) => option.value)).toEqual([
      '/api-feat',
      NEW_WORKSPACE_OPTION_VALUE
    ])
    expect(result.options.at(-1)?.label).toBe('New worktree from origin/main')
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
