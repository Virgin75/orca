import { create } from 'zustand'
import type { TestEnvironmentPortValues } from '../../../shared/test-environments'

export type TestEnvironmentRunPane = {
  leafId: string
  setupId: string
  setupName: string
  repoId: string
  repoName: string
  cwd: string
}

export type TestEnvironmentRun = {
  envId: string
  envName: string
  color: string
  worktreeId: string
  tabId: string
  ports: TestEnvironmentPortValues
  publicUrl: string
  panes: TestEnvironmentRunPane[]
  startedAt: number
}

type TestEnvironmentRunsState = {
  runsByWorktree: Record<string, TestEnvironmentRun>
  setRun: (run: TestEnvironmentRun) => void
  clearRun: (worktreeId: string) => void
}

const STORAGE_KEY = 'orca.testEnvironmentRuns.v1'

function isRun(value: unknown): value is TestEnvironmentRun {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record: Record<string, unknown> = { ...value }
  return (
    typeof record.envId === 'string' &&
    typeof record.tabId === 'string' &&
    typeof record.worktreeId === 'string' &&
    Array.isArray(record.panes)
  )
}

// Why: the run tab survives a renderer reload, so the panel must be able to reattach to it.
function readPersistedRuns(): Record<string, TestEnvironmentRun> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    return Object.fromEntries(Object.entries(parsed).filter(([, run]) => isRun(run)))
  } catch {
    return {}
  }
}

function persistRuns(runs: Record<string, TestEnvironmentRun>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
  } catch {
    // Storage is a convenience; the in-memory run still drives the panel.
  }
}

export const useTestEnvironmentRunsStore = create<TestEnvironmentRunsState>((set, get) => ({
  runsByWorktree: typeof window === 'undefined' ? {} : readPersistedRuns(),
  setRun: (run) => {
    const next = { ...get().runsByWorktree, [run.worktreeId]: run }
    set({ runsByWorktree: next })
    persistRuns(next)
  },
  clearRun: (worktreeId) => {
    if (!get().runsByWorktree[worktreeId]) {
      return
    }
    const next = { ...get().runsByWorktree }
    delete next[worktreeId]
    set({ runsByWorktree: next })
    persistRuns(next)
  }
}))
