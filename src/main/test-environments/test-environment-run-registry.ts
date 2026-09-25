import type { TestEnvironmentRunSummary } from '../../shared/test-environment-types'

// Why: runs are owned by desktop terminal tabs; the renderer publishes them so the CLI can read them.
let runsByWorktree = new Map<string, TestEnvironmentRunSummary>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toPorts(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  )
}

function toSetups(value: unknown): TestEnvironmentRunSummary['setups'] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((setup) =>
    isRecord(setup) &&
    typeof setup.setupName === 'string' &&
    typeof setup.repoName === 'string' &&
    typeof setup.cwd === 'string'
      ? [{ setupName: setup.setupName, repoName: setup.repoName, cwd: setup.cwd }]
      : []
  )
}

function toRunSummary(value: unknown): TestEnvironmentRunSummary | null {
  if (
    !isRecord(value) ||
    typeof value.envId !== 'string' ||
    typeof value.envName !== 'string' ||
    typeof value.worktreeId !== 'string' ||
    typeof value.startedAt !== 'number'
  ) {
    return null
  }
  return {
    envId: value.envId,
    envName: value.envName,
    worktreeId: value.worktreeId,
    ports: toPorts(value.ports),
    publicUrl: typeof value.publicUrl === 'string' ? value.publicUrl : '',
    startedAt: value.startedAt,
    setups: toSetups(value.setups)
  }
}

/** Replaces the whole set: the renderer always sends every run it currently holds. */
export function syncTestEnvironmentRuns(runs: unknown): void {
  const next = new Map<string, TestEnvironmentRunSummary>()
  if (Array.isArray(runs)) {
    for (const raw of runs) {
      const run = toRunSummary(raw)
      if (run) {
        next.set(run.worktreeId, run)
      }
    }
  }
  runsByWorktree = next
}

export function getTestEnvironmentRun(worktreeId: string): TestEnvironmentRunSummary | null {
  return runsByWorktree.get(worktreeId) ?? null
}
