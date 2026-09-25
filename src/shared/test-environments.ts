import type {
  TestEnvironment,
  TestEnvironmentEnvVar,
  TestEnvironmentPort,
  TestEnvironmentRepo,
  TestEnvironmentSetup
} from './test-environment-types'

export const MAX_TEST_ENVIRONMENTS = 40
export const MAX_TEST_ENVIRONMENT_PORTS = 32
export const MAX_TEST_ENVIRONMENT_REPOS = 16
export const MAX_TEST_ENVIRONMENT_SETUPS = 16
export const MAX_TEST_ENVIRONMENT_ENV_VARS = 64
export const MAX_TEST_ENVIRONMENT_SCRIPT_LENGTH = 20_000
export const MAX_TEST_ENVIRONMENT_TEXT_LENGTH = 2_000
export const DEFAULT_TEST_ENVIRONMENT_COLOR = '#3b82f6'

const PORT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const TEMPLATE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

type NormalizeOptions = { createId?: () => string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, max = MAX_TEST_ENVIRONMENT_TEXT_LENGTH): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function list(value: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord).slice(0, max) : []
}

function idOf(
  record: Record<string, unknown>,
  fallback: string,
  seen: Set<string>,
  options: NormalizeOptions
): string {
  let id = text(record.id, 200).trim()
  if (!id || seen.has(id)) {
    id = options.createId?.().trim() || fallback
  }
  while (seen.has(id)) {
    id = `${id}-x`
  }
  seen.add(id)
  return id
}

export function isValidTestEnvironmentPortName(name: string): boolean {
  return PORT_NAME_PATTERN.test(name)
}

function normalizeEnvVars(value: unknown, options: NormalizeOptions): TestEnvironmentEnvVar[] {
  const seen = new Set<string>()
  return list(value, MAX_TEST_ENVIRONMENT_ENV_VARS).map((row, index) => ({
    id: idOf(row, `env-${index + 1}`, seen, options),
    key: text(row.key, 200).trim(),
    value: text(row.value)
  }))
}

function normalizeSetups(value: unknown, options: NormalizeOptions): TestEnvironmentSetup[] {
  const seen = new Set<string>()
  return list(value, MAX_TEST_ENVIRONMENT_SETUPS).map((row, index) => ({
    id: idOf(row, `setup-${index + 1}`, seen, options),
    name: text(row.name, 200),
    env: normalizeEnvVars(row.env, options),
    script: text(row.script, MAX_TEST_ENVIRONMENT_SCRIPT_LENGTH)
  }))
}

function normalizeRepos(value: unknown, options: NormalizeOptions): TestEnvironmentRepo[] {
  const seen = new Set<string>()
  return list(value, MAX_TEST_ENVIRONMENT_REPOS).map((row, index) => ({
    id: idOf(row, `repo-${index + 1}`, seen, options),
    repoId: text(row.repoId, 200).trim(),
    setups: normalizeSetups(row.setups, options)
  }))
}

function normalizePorts(value: unknown, options: NormalizeOptions): TestEnvironmentPort[] {
  const seen = new Set<string>()
  return list(value, MAX_TEST_ENVIRONMENT_PORTS).map((row, index) => ({
    id: idOf(row, `port-${index + 1}`, seen, options),
    name: text(row.name, 100).trim()
  }))
}

/** Keeps incomplete rows so a half-edited environment is not dropped while being filled in. */
export function normalizeTestEnvironments(
  value: unknown,
  options: NormalizeOptions = {}
): TestEnvironment[] {
  const seen = new Set<string>()
  return list(value, MAX_TEST_ENVIRONMENTS).map((row, index) => ({
    id: idOf(row, `test-env-${index + 1}`, seen, options),
    name: text(row.name, 200),
    color: /^#[0-9a-fA-F]{6}$/.test(text(row.color))
      ? text(row.color)
      : DEFAULT_TEST_ENVIRONMENT_COLOR,
    ports: normalizePorts(row.ports, options),
    repos: normalizeRepos(row.repos, options),
    publicUrl: text(row.publicUrl).trim()
  }))
}

export function testEnvironmentIncludesRepo(env: TestEnvironment, repoId: string): boolean {
  return env.repos.some((repo) => repo.repoId === repoId && repo.setups.length > 0)
}

export type TestEnvironmentPortValues = Record<string, number>

/** Replaces `{{NAME}}` with the allocated port; unknown names are left untouched. */
export function renderTestEnvironmentTemplate(
  template: string,
  ports: TestEnvironmentPortValues
): string {
  return template.replace(TEMPLATE_PATTERN, (match, name: string) =>
    Object.hasOwn(ports, name) ? String(ports[name]) : match
  )
}

export function findUnknownTestEnvironmentPlaceholders(
  template: string,
  portNames: readonly string[]
): string[] {
  const known = new Set(portNames)
  const unknown = new Set<string>()
  for (const match of template.matchAll(TEMPLATE_PATTERN)) {
    if (!known.has(match[1])) {
      unknown.add(match[1])
    }
  }
  return [...unknown]
}

export type TestEnvironmentValidationIssue = { path: string; message: string }

export function validateTestEnvironment(env: TestEnvironment): TestEnvironmentValidationIssue[] {
  const issues: TestEnvironmentValidationIssue[] = []
  if (!env.name.trim()) {
    issues.push({ path: 'name', message: 'Name is required.' })
  }
  const portNames = env.ports.map((port) => port.name)
  const seenPorts = new Set<string>()
  for (const port of env.ports) {
    if (!isValidTestEnvironmentPortName(port.name)) {
      issues.push({
        path: `ports.${port.id}`,
        message: `Port name "${port.name}" must be letters, digits or underscores.`
      })
    } else if (seenPorts.has(port.name)) {
      issues.push({ path: `ports.${port.id}`, message: `Port "${port.name}" is defined twice.` })
    }
    seenPorts.add(port.name)
  }
  if (env.repos.length === 0) {
    issues.push({ path: 'repos', message: 'Add at least one repository.' })
  }
  for (const repo of env.repos) {
    if (!repo.repoId) {
      issues.push({ path: `repos.${repo.id}`, message: 'Pick a repository.' })
    }
    if (repo.setups.length === 0) {
      issues.push({ path: `repos.${repo.id}`, message: 'Add at least one setup.' })
    }
    for (const setup of repo.setups) {
      if (!setup.name.trim()) {
        issues.push({ path: `setups.${setup.id}`, message: 'Setup name is required.' })
      }
      for (const envVar of setup.env) {
        if (!isValidTestEnvironmentPortName(envVar.key)) {
          issues.push({
            path: `setups.${setup.id}`,
            message: `Env var name "${envVar.key}" is not a valid shell variable name.`
          })
        }
      }
      const unknown = setup.env.flatMap((envVar) =>
        findUnknownTestEnvironmentPlaceholders(envVar.value, portNames)
      )
      for (const name of new Set(unknown)) {
        issues.push({ path: `setups.${setup.id}`, message: `Unknown port "{{${name}}}".` })
      }
    }
  }
  for (const name of findUnknownTestEnvironmentPlaceholders(env.publicUrl, portNames)) {
    issues.push({ path: 'publicUrl', message: `Unknown port "{{${name}}}" in public URL.` })
  }
  return issues
}

export const TEST_ENVIRONMENT_SCRIPT_ENV = 'ORCA_TEST_ENV_SCRIPT'
export const TEST_ENVIRONMENT_PUBLIC_URL_ENV = 'ORCA_TEST_ENV_PUBLIC_URL'
/** Typed into the pane's shell; the script itself travels in the pty env so it is never echoed. */
export const TEST_ENVIRONMENT_SETUP_COMMAND = `bash -c "$${TEST_ENVIRONMENT_SCRIPT_ENV}"`

/** Env for one setup pane: ports first, then the public URL, then the setup's own vars. */
export function buildTestEnvironmentSetupEnv(args: {
  setup: TestEnvironmentSetup
  ports: TestEnvironmentPortValues
  publicUrl: string
}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, port] of Object.entries(args.ports)) {
    env[name] = String(port)
  }
  if (args.publicUrl) {
    env[TEST_ENVIRONMENT_PUBLIC_URL_ENV] = args.publicUrl
  }
  for (const envVar of args.setup.env) {
    if (isValidTestEnvironmentPortName(envVar.key)) {
      env[envVar.key] = renderTestEnvironmentTemplate(envVar.value, args.ports)
    }
  }
  env[TEST_ENVIRONMENT_SCRIPT_ENV] = args.setup.script.trim() || 'true'
  return env
}
