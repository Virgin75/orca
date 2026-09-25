import { useAppStore } from '@/store'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'
import {
  queueTerminalCommandSplits,
  type TerminalCommandSplitPane
} from '@/lib/terminal-command-split-queue'
import { closeTerminalTab } from '@/components/terminal/terminal-tab-actions'
import {
  useTestEnvironmentRunsStore,
  type TestEnvironmentRun,
  type TestEnvironmentRunPane
} from '@/store/test-environment-runs'
import {
  listTestEnvironmentSetups,
  renderTestEnvironmentTemplate,
  type TestEnvironmentPortValues
} from '../../../shared/test-environments'
import {
  TEST_ENVIRONMENT_SETUP_COMMAND,
  buildTestEnvironmentSetupEnv,
  type TestEnvironmentSetupDependency
} from '../../../shared/test-environment-pane-script'
import type { TestEnvironment } from '../../../shared/test-environment-types'
import type { TestEnvironmentDirectoryChoice } from '@/lib/test-environment-directories'
import { buildSetupRunnerCommand } from '@/lib/setup-runner'
import type { WorktreeSetupLaunch } from '../../../shared/worktree/launch-types'

const RANDOM_PORT_MIN = 20_000
const RANDOM_PORT_MAX = 60_000

function randomPorts(count: number, taken: ReadonlySet<number>): number[] {
  const picked = new Set<number>()
  while (picked.size < count) {
    const port = RANDOM_PORT_MIN + Math.floor(Math.random() * (RANDOM_PORT_MAX - RANDOM_PORT_MIN))
    if (!taken.has(port)) {
      picked.add(port)
    }
  }
  return [...picked]
}

async function allocatePorts(count: number, connectionId: string | null): Promise<number[]> {
  if (count === 0) {
    return []
  }
  if (connectionId) {
    // Why: the OS probe runs on this machine; on SSH, avoid what the remote already listens on.
    const detected = await window.api.ssh
      .listDetectedPorts({ targetId: connectionId })
      .catch(() => [])
    return randomPorts(count, new Set((detected ?? []).map((port) => port.port)))
  }
  const local = await window.api.testEnvironments?.allocateLocalPorts(count)
  return Array.isArray(local) && local.length === count ? local : randomPorts(count, new Set())
}

export type LaunchTestEnvironmentArgs = {
  env: TestEnvironment
  worktreeId: string
  /** Directory per test env repo entry id. Entries without one are skipped. */
  directories: Record<string, TestEnvironmentDirectoryChoice>
  /** `env` is a one-off edited copy (not in Settings); keep it on the run for Restart. */
  isCustom?: boolean
}

/** A setup waiting on one that is not launched would wait forever, so refuse up front. */
function assertDependenciesLaunched(
  env: TestEnvironment,
  choices: Record<string, TestEnvironmentDirectoryChoice>
): void {
  const launched = new Set(
    env.repos.filter((entry) => choices[entry.id]).flatMap((entry) => entry.setups.map((s) => s.id))
  )
  const setups = listTestEnvironmentSetups(env)
  const byId = new Map(setups.map((setup) => [setup.id, setup]))
  for (const setup of setups) {
    if (launched.has(setup.id) && setup.dependsOn && !launched.has(setup.dependsOn)) {
      const dependency = byId.get(setup.dependsOn)?.name ?? setup.dependsOn
      throw new Error(`"${setup.name}" depends on "${dependency}", which is not being launched.`)
    }
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'test-env'
  )
}

async function resolveDirectories(
  env: TestEnvironment,
  directories: Record<string, TestEnvironmentDirectoryChoice>
): Promise<{
  paths: Record<string, string>
  worktreeSetups: Record<string, WorktreeSetupLaunch>
}> {
  const paths: Record<string, string> = {}
  const worktreeSetups: Record<string, WorktreeSetupLaunch> = {}
  const suffix = Date.now().toString(36).slice(-4)
  for (const entry of env.repos) {
    const choice = directories[entry.id]
    if (!choice) {
      continue
    }
    if (choice.kind === 'path') {
      paths[entry.id] = choice.path
      continue
    }
    // Why: base omitted so the host picks the repo's default; setup forced because a test env
    // needs an installed worktree whatever the repo's policy ('inherit' throws on "ask").
    const created = await useAppStore
      .getState()
      .createWorktree(entry.repoId, `${slugify(env.name)}-${suffix}`, undefined, 'run')
    paths[entry.id] = created.worktree.path
    // Why: createWorktree only prepares the repo setup; the caller must run it, before the test env.
    if (created.setup) {
      worktreeSetups[entry.id] = created.setup
    }
  }
  return { paths, worktreeSetups }
}

export async function launchTestEnvironment({
  env,
  worktreeId,
  directories: choices,
  isCustom = false
}: LaunchTestEnvironmentArgs): Promise<TestEnvironmentRun> {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree) {
    throw new Error('Workspace not found.')
  }
  const repoById = new Map(state.repos.map((repo) => [repo.id, repo]))
  const connectionId = repoById.get(worktree.repoId)?.connectionId ?? null

  assertDependenciesLaunched(env, choices)
  const { paths: directories, worktreeSetups } = await resolveDirectories(env, choices)
  const portList = await allocatePorts(env.ports.length, connectionId)
  const ports: TestEnvironmentPortValues = {}
  env.ports.forEach((port, index) => {
    ports[port.name] = portList[index]
  })
  const publicUrl = renderTestEnvironmentTemplate(env.publicUrl, ports)

  const runId = crypto.randomUUID()
  const setupById = new Map(listTestEnvironmentSetups(env).map((setup) => [setup.id, setup]))
  const dependencyOf = (
    dependsOn: string | undefined
  ): TestEnvironmentSetupDependency | undefined => {
    const dependency = dependsOn ? setupById.get(dependsOn) : undefined
    if (!dependency) {
      return undefined
    }
    return {
      setupId: dependency.id,
      name: dependency.name,
      port: dependency.readyPort ? ports[dependency.readyPort] : undefined
    }
  }
  const runPanes: TestEnvironmentRunPane[] = []
  const rows: TerminalCommandSplitPane[][] = []
  for (const entry of env.repos) {
    const cwd = directories[entry.id]
    if (!cwd || entry.setups.length === 0) {
      continue
    }
    const repoName = repoById.get(entry.repoId)?.displayName ?? entry.repoId
    const worktreeSetup = worktreeSetups[entry.id]
    const worktreeSetupId = crypto.randomUUID()
    rows.push(
      entry.setups.map((setup, index) => {
        const leafId = crypto.randomUUID()
        runPanes.push({
          leafId,
          setupId: setup.id,
          setupName: setup.name,
          repoId: entry.repoId,
          repoName,
          cwd
        })
        return {
          leafId,
          cwd,
          command: TEST_ENVIRONMENT_SETUP_COMMAND,
          env: buildTestEnvironmentSetupEnv({
            runId,
            setup,
            dependency: dependencyOf(setup.dependsOn),
            ports,
            publicUrl,
            worktreeSetup: worktreeSetup
              ? {
                  id: worktreeSetupId,
                  command:
                    worktreeSetup.command ??
                    buildSetupRunnerCommand(worktreeSetup.runnerScriptPath, worktreeSetup.shell),
                  env: worktreeSetup.envVars,
                  role: index === 0 ? 'run' : 'wait'
                }
              : undefined
          })
        }
      })
    )
  }
  const first = rows[0]?.[0]
  if (!first) {
    throw new Error('No setups to run from this workspace.')
  }

  const previous = useTestEnvironmentRunsStore.getState().runsByWorktree[worktreeId]
  if (previous) {
    stopTestEnvironment(previous)
  }

  const store = useAppStore.getState()
  const tab = store.createTab(worktreeId, undefined, undefined, {
    initialLeafId: first.leafId,
    pendingStartup: { command: first.command, env: first.env }
  })
  // Why: queue before React renders the tab — TerminalPane snapshots these on first render.
  store.queueTabInitialCwd(tab.id, first.cwd ?? worktree.path)
  queueTerminalCommandSplits(tab.id, { rows })
  store.setTabCustomTitle(tab.id, env.name, { recordInteraction: false })
  store.setTabColor(tab.id, env.color)
  store.setActiveTabType('terminal')
  persistAgentLaunchTabOrder(worktreeId, tab.id)

  const run: TestEnvironmentRun = {
    envId: env.id,
    envName: env.name,
    color: env.color,
    worktreeId,
    tabId: tab.id,
    ports,
    publicUrl,
    panes: runPanes,
    startedAt: Date.now(),
    ...(isCustom ? { customEnv: env } : {})
  }
  useTestEnvironmentRunsStore.getState().setRun(run)
  return run
}

export function stopTestEnvironment(run: TestEnvironmentRun): void {
  useTestEnvironmentRunsStore.getState().clearRun(run.worktreeId)
  const tabExists = (useAppStore.getState().tabsByWorktree[run.worktreeId] ?? []).some(
    (tab) => tab.id === run.tabId
  )
  if (tabExists) {
    closeTerminalTab(run.tabId, { skipRunningProcessConfirm: true })
  }
}
