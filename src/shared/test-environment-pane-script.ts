import {
  isValidTestEnvironmentPortName,
  renderTestEnvironmentTemplate,
  type TestEnvironmentPortValues
} from './test-environments'
import type { TestEnvironmentSetup } from './test-environment-types'

export const TEST_ENVIRONMENT_SCRIPT_ENV = 'ORCA_TEST_ENV_SCRIPT'
export const TEST_ENVIRONMENT_PUBLIC_URL_ENV = 'ORCA_TEST_ENV_PUBLIC_URL'
/** Typed into the pane's shell; the script itself travels in the pty env so it is never echoed. */
export const TEST_ENVIRONMENT_SETUP_COMMAND = `bash -c "$${TEST_ENVIRONMENT_SCRIPT_ENV}"`

const RUN_ID_ENV = 'ORCA_TEST_ENV_RUN_ID'
const SETUP_KEY_ENV = 'ORCA_TEST_ENV_SETUP_KEY'
const WORKTREE_SETUP_COMMAND_ENV = 'ORCA_TEST_ENV_WORKTREE_SETUP'
const WORKTREE_SETUP_ID_ENV = 'ORCA_TEST_ENV_WORKTREE_SETUP_ID'
const DEPENDS_ON_KEY_ENV = 'ORCA_TEST_ENV_DEPENDS_ON'
const DEPENDS_ON_NAME_ENV = 'ORCA_TEST_ENV_DEPENDS_ON_NAME'
const DEPENDS_ON_PORT_ENV = 'ORCA_TEST_ENV_DEPENDS_ON_PORT'

/**
 * A freshly created worktree's own setup script. One pane per repo runs it; the
 * repo's other panes wait on its marker so no test env script starts before it.
 */
export type TestEnvironmentWorktreeSetup = {
  id: string
  command: string
  env: Record<string, string>
  role: 'run' | 'wait'
}

/** The setup this pane waits for; `port` set means "ready once it accepts connections". */
export type TestEnvironmentSetupDependency = {
  setupId: string
  name: string
  port?: number
}

/** Marker file names are built from setup ids, which are user-editable text. */
export function testEnvironmentMarkerKey(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_')
}

// Markers live in one per-run directory on the host running the panes, so this works over SSH too.
const RUN_DIR = `"\${TMPDIR:-/tmp}/orca-test-env-$${RUN_ID_ENV}"`
const SELF = `${RUN_DIR}/setup-"$${SETUP_KEY_ENV}"`
const DEP = `${RUN_DIR}/setup-"$${DEPENDS_ON_KEY_ENV}"`
const WORKTREE = `${RUN_DIR}/worktree-"$${WORKTREE_SETUP_ID_ENV}"`

const PRELUDE = [
  `mkdir -p ${RUN_DIR}`,
  // Why: dependents watch these markers to abort instead of waiting forever.
  `orca_fail() { touch ${SELF}.fail; echo "[orca] $1" >&2; exit 1; }`
]

function worktreeGate(role: 'run' | 'wait'): string[] {
  return role === 'run'
    ? [
        'echo "[orca] Running the worktree setup script..."',
        `if eval "$${WORKTREE_SETUP_COMMAND_ENV}"; then touch ${WORKTREE}.ok; else`,
        `  touch ${WORKTREE}.fail`,
        '  orca_fail "Worktree setup failed; test env script not started."',
        'fi'
      ]
    : [
        'echo "[orca] Waiting for the worktree setup script..."',
        `while [ ! -e ${WORKTREE}.ok ] && [ ! -e ${WORKTREE}.fail ]; do sleep 1; done`,
        `[ -e ${WORKTREE}.fail ] && orca_fail "Worktree setup failed; test env script not started."`
      ]
}

function dependencyGate(): string[] {
  const port = `"$${DEPENDS_ON_PORT_ENV}"`
  return [
    `echo "[orca] Waiting for $${DEPENDS_ON_NAME_ENV} to be ready..."`,
    'while :; do',
    `  [ -e ${DEP}.fail ] && orca_fail "$${DEPENDS_ON_NAME_ENV} failed; not started."`,
    `  if [ -n ${port} ]; then`,
    // Why: bash's /dev/tcp needs no nc/curl; try both loopbacks since servers may bind either.
    `    (exec 3<>"/dev/tcp/127.0.0.1/$${DEPENDS_ON_PORT_ENV}") 2>/dev/null && break`,
    `    (exec 3<>"/dev/tcp/localhost/$${DEPENDS_ON_PORT_ENV}") 2>/dev/null && break`,
    `    [ -e ${DEP}.exited ] && orca_fail "$${DEPENDS_ON_NAME_ENV} exited before port ${port} opened; not started."`,
    `  elif [ -e ${DEP}.started ]; then`,
    '    break',
    '  fi',
    '  sleep 1',
    'done',
    `echo "[orca] $${DEPENDS_ON_NAME_ENV} is ready."`
  ]
}

function buildPaneScript(
  script: string,
  worktreeRole: 'run' | 'wait' | null,
  hasDependency: boolean
): string {
  return [
    ...PRELUDE,
    ...(worktreeRole ? worktreeGate(worktreeRole) : []),
    ...(hasDependency ? dependencyGate() : []),
    `touch ${SELF}.started`,
    // Why: a subshell lets us record the exit so port-waiting dependents stop waiting.
    '(',
    script,
    ')',
    'orca_status=$?',
    `touch ${SELF}.exited`,
    'exit $orca_status'
  ].join('\n')
}

/** Env for one setup pane: ports first, then the public URL, then the setup's own vars. */
export function buildTestEnvironmentSetupEnv(args: {
  runId: string
  setup: TestEnvironmentSetup
  ports: TestEnvironmentPortValues
  publicUrl: string
  worktreeSetup?: TestEnvironmentWorktreeSetup
  dependency?: TestEnvironmentSetupDependency
}): Record<string, string> {
  // Why: the worktree setup's own env comes first so the test env's values win on conflicts.
  const env: Record<string, string> =
    args.worktreeSetup?.role === 'run' ? { ...args.worktreeSetup.env } : {}
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
  env[RUN_ID_ENV] = testEnvironmentMarkerKey(args.runId)
  env[SETUP_KEY_ENV] = testEnvironmentMarkerKey(args.setup.id)
  if (args.worktreeSetup) {
    env[WORKTREE_SETUP_ID_ENV] = testEnvironmentMarkerKey(args.worktreeSetup.id)
    if (args.worktreeSetup.role === 'run') {
      env[WORKTREE_SETUP_COMMAND_ENV] = args.worktreeSetup.command
    }
  }
  if (args.dependency) {
    env[DEPENDS_ON_KEY_ENV] = testEnvironmentMarkerKey(args.dependency.setupId)
    env[DEPENDS_ON_NAME_ENV] = args.dependency.name
    env[DEPENDS_ON_PORT_ENV] =
      args.dependency.port === undefined ? '' : String(args.dependency.port)
  }
  env[TEST_ENVIRONMENT_SCRIPT_ENV] = buildPaneScript(
    args.setup.script.trim() || 'true',
    args.worktreeSetup?.role ?? null,
    Boolean(args.dependency)
  )
  return env
}
