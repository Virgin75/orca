import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEST_ENVIRONMENT_COLOR,
  normalizeTestEnvironments,
  renderTestEnvironmentTemplate,
  validateTestEnvironment
} from './test-environments'
import type { TestEnvironment } from './test-environment-types'

function makeEnv(overrides: Partial<TestEnvironment> = {}): TestEnvironment {
  return {
    id: 'env-1',
    name: 'Full stack',
    color: '#ff0000',
    ports: [
      { id: 'p1', name: 'API_PORT' },
      { id: 'p2', name: 'APP_PORT' }
    ],
    repos: [
      {
        id: 'r1',
        repoId: 'repo-api',
        setups: [
          {
            id: 's1',
            name: 'API server',
            env: [{ id: 'e1', key: 'API_URL', value: 'http://localhost:{{API_PORT}}' }],
            script: 'make run'
          }
        ]
      }
    ],
    publicUrl: 'http://localhost:{{APP_PORT}}',
    ...overrides
  }
}

describe('normalizeTestEnvironments', () => {
  it('returns [] for non-arrays', () => {
    expect(normalizeTestEnvironments(undefined)).toEqual([])
    expect(normalizeTestEnvironments({})).toEqual([])
  })

  it('keeps incomplete rows and fills missing ids and colors', () => {
    const [env] = normalizeTestEnvironments([{ name: 'Draft', color: 'red', repos: [{}] }])
    expect(env.id).toBe('test-env-1')
    expect(env.color).toBe(DEFAULT_TEST_ENVIRONMENT_COLOR)
    expect(env.repos).toEqual([{ id: 'repo-1', repoId: '', setups: [] }])
    expect(env.ports).toEqual([])
    expect(env.publicUrl).toBe('')
  })

  it('re-mints duplicate ids', () => {
    const envs = normalizeTestEnvironments([{ id: 'a' }, { id: 'a' }], { createId: () => 'b' })
    expect(envs.map((env) => env.id)).toEqual(['a', 'b'])
  })

  it('keeps dependsOn and readyPort only when set', () => {
    const env = makeEnv()
    env.repos[0].setups[0] = { ...env.repos[0].setups[0], dependsOn: ' x ', readyPort: '' }
    const [normalized] = normalizeTestEnvironments([env])
    expect(normalized.repos[0].setups[0].dependsOn).toBe('x')
    expect('readyPort' in normalized.repos[0].setups[0]).toBe(false)
  })

  it('round-trips a valid environment unchanged', () => {
    const env = makeEnv()
    expect(normalizeTestEnvironments([env])).toEqual([env])
  })
})

describe('renderTestEnvironmentTemplate', () => {
  it('replaces known ports and keeps unknown placeholders', () => {
    expect(
      renderTestEnvironmentTemplate('http://h:{{ API_PORT }}/{{OTHER}}', { API_PORT: 4001 })
    ).toBe('http://h:4001/{{OTHER}}')
  })
})

describe('validateTestEnvironment', () => {
  it('rejects dependency cycles, missing dependencies and unknown ready ports', () => {
    const env = makeEnv()
    const setup = env.repos[0].setups[0]
    env.repos[0].setups = [
      { ...setup, id: 'a', name: 'A', dependsOn: 'b', readyPort: 'NOPE' },
      { ...setup, id: 'b', name: 'B', dependsOn: 'a' },
      { ...setup, id: 'c', name: 'C', dependsOn: 'gone' }
    ]
    const messages = validateTestEnvironment(env).map((issue) => issue.message)
    expect(messages).toContain('"A" is ready on unknown port "NOPE".')
    expect(messages).toContain('"A" is part of a dependency cycle.')
    expect(messages).toContain('"B" is part of a dependency cycle.')
    expect(messages).toContain('"C" depends on a setup that no longer exists.')
  })

  it('accepts a dependency with a known ready port', () => {
    const env = makeEnv()
    const setup = env.repos[0].setups[0]
    env.repos[0].setups = [
      { ...setup, id: 'api', name: 'API', readyPort: 'API_PORT' },
      { ...setup, id: 'worker', name: 'Worker', dependsOn: 'api' }
    ]
    expect(validateTestEnvironment(env)).toEqual([])
  })

  it('accepts a complete environment', () => {
    expect(validateTestEnvironment(makeEnv())).toEqual([])
  })

  it('reports unknown placeholders, bad port names and missing setups', () => {
    const issues = validateTestEnvironment(
      makeEnv({
        ports: [{ id: 'p1', name: 'bad-name' }],
        repos: [{ id: 'r1', repoId: 'x', setups: [] }],
        publicUrl: 'http://localhost:{{APP_PORT}}'
      })
    )
    const messages = issues.map((issue) => issue.message)
    expect(messages).toContain('Port name "bad-name" must be letters, digits or underscores.')
    expect(messages).toContain('Add at least one setup.')
    expect(messages).toContain('Unknown port "{{APP_PORT}}" in public URL.')
  })
})
