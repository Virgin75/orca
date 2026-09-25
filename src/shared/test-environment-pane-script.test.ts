import { describe, expect, it } from 'vitest'
import {
  TEST_ENVIRONMENT_PUBLIC_URL_ENV,
  TEST_ENVIRONMENT_SCRIPT_ENV,
  buildTestEnvironmentSetupEnv
} from './test-environment-pane-script'
import type { TestEnvironmentSetup } from './test-environment-types'

const setup: TestEnvironmentSetup = {
  id: 's1',
  name: 'API server',
  env: [{ id: 'e1', key: 'API_URL', value: 'http://localhost:{{API_PORT}}' }],
  script: 'make run'
}

describe('buildTestEnvironmentSetupEnv', () => {
  it('exports ports, the public URL, rendered vars and the wrapped script', () => {
    const env = buildTestEnvironmentSetupEnv({
      runId: 'run-1',
      setup,
      ports: { API_PORT: 4001, APP_PORT: 4002 },
      publicUrl: 'http://localhost:4002'
    })
    expect(env).toMatchObject({
      API_PORT: '4001',
      APP_PORT: '4002',
      [TEST_ENVIRONMENT_PUBLIC_URL_ENV]: 'http://localhost:4002',
      API_URL: 'http://localhost:4001',
      ORCA_TEST_ENV_RUN_ID: 'run-1',
      ORCA_TEST_ENV_SETUP_KEY: 's1'
    })
    const script = env[TEST_ENVIRONMENT_SCRIPT_ENV]
    expect(script).toContain('make run')
    expect(script).not.toContain('Waiting for')
  })

  it('runs the worktree setup in one pane and gates the others on its marker', () => {
    const worktreeSetup = {
      id: 'abc',
      command: 'bash /tmp/setup.sh',
      env: { ORCA_ROOT: '/r' }
    }
    const runner = buildTestEnvironmentSetupEnv({
      runId: 'r',
      setup,
      ports: {},
      publicUrl: '',
      worktreeSetup: { ...worktreeSetup, role: 'run' }
    })
    expect(runner.ORCA_ROOT).toBe('/r')
    expect(runner.ORCA_TEST_ENV_WORKTREE_SETUP).toBe('bash /tmp/setup.sh')
    const runScript = runner[TEST_ENVIRONMENT_SCRIPT_ENV]
    expect(runScript.indexOf('eval "$ORCA_TEST_ENV_WORKTREE_SETUP"')).toBeLessThan(
      runScript.indexOf('make run')
    )

    const waiter = buildTestEnvironmentSetupEnv({
      runId: 'r',
      setup,
      ports: {},
      publicUrl: '',
      worktreeSetup: { ...worktreeSetup, role: 'wait' }
    })
    expect(waiter.ORCA_ROOT).toBeUndefined()
    expect(waiter.ORCA_TEST_ENV_WORKTREE_SETUP).toBeUndefined()
    expect(waiter[TEST_ENVIRONMENT_SCRIPT_ENV]).toContain('Waiting for the worktree setup script')
  })

  it('waits for the dependency port before starting', () => {
    const env = buildTestEnvironmentSetupEnv({
      runId: 'r',
      setup,
      ports: { API_PORT: 4001 },
      publicUrl: '',
      dependency: { setupId: 'db/1', name: 'Database', port: 5432 }
    })
    expect(env.ORCA_TEST_ENV_DEPENDS_ON).toBe('db_1')
    expect(env.ORCA_TEST_ENV_DEPENDS_ON_NAME).toBe('Database')
    expect(env.ORCA_TEST_ENV_DEPENDS_ON_PORT).toBe('5432')
    const script = env[TEST_ENVIRONMENT_SCRIPT_ENV]
    expect(script.indexOf('/dev/tcp/127.0.0.1/')).toBeLessThan(script.indexOf('make run'))
  })
})
