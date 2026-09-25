import { beforeEach, describe, expect, it } from 'vitest'
import { getTestEnvironmentRun, syncTestEnvironmentRuns } from './test-environment-run-registry'

const run = {
  envId: 'env-1',
  envName: 'Care stack',
  worktreeId: 'repo-1::/tmp/wt',
  ports: { API_PORT: 4011, BAD: 'x' },
  publicUrl: 'http://localhost:5173',
  startedAt: 1000,
  setups: [{ setupName: 'api', repoName: 'orca-api', cwd: '/tmp/wt/api' }, { setupName: 1 }]
}

describe('test environment run registry', () => {
  beforeEach(() => syncTestEnvironmentRuns([]))

  it('keeps valid runs and drops malformed fields', () => {
    syncTestEnvironmentRuns([run, { envId: 'broken' }])
    expect(getTestEnvironmentRun('repo-1::/tmp/wt')).toEqual({
      ...run,
      ports: { API_PORT: 4011 },
      setups: [{ setupName: 'api', repoName: 'orca-api', cwd: '/tmp/wt/api' }]
    })
  })

  it('replaces the previous set so stopped runs disappear', () => {
    syncTestEnvironmentRuns([run])
    syncTestEnvironmentRuns([])
    expect(getTestEnvironmentRun('repo-1::/tmp/wt')).toBeNull()
  })
})
