import { create } from 'zustand'
import type { TestEnvironmentPortValues } from '../../../shared/test-environments'
import type {
  TestEnvironment,
  TestEnvironmentRunSummary
} from '../../../shared/test-environment-types'

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
  /** Set for a one-off custom launch so Restart reuses its values instead of Settings. */
  customEnv?: TestEnvironment
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

function toRunSummary(run: TestEnvironmentRun): TestEnvironmentRunSummary {
  return {
    envId: run.envId,
    envName: run.envName,
    worktreeId: run.worktreeId,
    ports: run.ports,
    publicUrl: run.publicUrl,
    startedAt: run.startedAt,
    setups: run.panes.map(({ setupName, repoName, cwd }) => ({ setupName, repoName, cwd }))
  }
}

// Why: main can't read renderer storage, and `orca worktree show` reports the run from there.
function publishRuns(runs: Record<string, TestEnvironmentRun>): void {
  try {
    window.api.testEnvironments.syncRuns(Object.values(runs).map(toRunSummary))
  } catch {
    // No preload bridge (tests, web client): the CLI simply won't see the run.
  }
}

function initialRuns(): Record<string, TestEnvironmentRun> {
  if (typeof window === 'undefined') {
    return {}
  }
  const runs = readPersistedRuns()
  publishRuns(runs)
  return runs
}

export const useTestEnvironmentRunsStore = create<TestEnvironmentRunsState>((set, get) => ({
  runsByWorktree: initialRuns(),
  setRun: (run) => {
    const next = { ...get().runsByWorktree, [run.worktreeId]: run }
    set({ runsByWorktree: next })
    persistRuns(next)
    publishRuns(next)
  },
  clearRun: (worktreeId) => {
    if (!get().runsByWorktree[worktreeId]) {
      return
    }
    const next = { ...get().runsByWorktree }
    delete next[worktreeId]
    set({ runsByWorktree: next })
    persistRuns(next)
    publishRuns(next)
  }
}))
