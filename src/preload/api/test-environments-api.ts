import type { TestEnvironmentRunSummary } from '../../shared/test-environment-types'

export type TestEnvironmentsApi = {
  /** Distinct free TCP ports on this machine (not valid for SSH hosts). */
  allocateLocalPorts: (count: number) => Promise<number[]>
  /** Publishes every run this window holds so `orca worktree show` can report it. */
  syncRuns: (runs: TestEnvironmentRunSummary[]) => void
}
