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
  TEST_ENVIRONMENT_SETUP_COMMAND,
  buildTestEnvironmentSetupEnv,
  renderTestEnvironmentTemplate,
  type TestEnvironmentPortValues
} from '../../../shared/test-environments'
import type { TestEnvironment } from '../../../shared/test-environment-types'
import type { TestEnvironmentDirectoryChoice } from '@/lib/test-environment-directories'

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
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {}
  const suffix = Date.now().toString(36).slice(-4)
  for (const entry of env.repos) {
    const choice = directories[entry.id]
    if (!choice) {
      continue
    }
    if (choice.kind === 'path') {
      resolved[entry.id] = choice.path
      continue
    }
    // Why: base branch omitted so the host picks the repo's configured default (usually main).
    const created = await useAppStore
      .getState()
      .createWorktree(entry.repoId, `${slugify(env.name)}-${suffix}`, undefined, 'inherit')
    resolved[entry.id] = created.worktree.path
  }
  return resolved
}

export async function launchTestEnvironment({
  env,
  worktreeId,
  directories: choices
}: LaunchTestEnvironmentArgs): Promise<TestEnvironmentRun> {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree) {
    throw new Error('Workspace not found.')
  }
  const repoById = new Map(state.repos.map((repo) => [repo.id, repo]))
  const connectionId = repoById.get(worktree.repoId)?.connectionId ?? null

  const directories = await resolveDirectories(env, choices)
  const portList = await allocatePorts(env.ports.length, connectionId)
  const ports: TestEnvironmentPortValues = {}
  env.ports.forEach((port, index) => {
    ports[port.name] = portList[index]
  })
  const publicUrl = renderTestEnvironmentTemplate(env.publicUrl, ports)

  const runPanes: TestEnvironmentRunPane[] = []
  const rows: TerminalCommandSplitPane[][] = []
  for (const entry of env.repos) {
    const cwd = directories[entry.id]
    if (!cwd || entry.setups.length === 0) {
      continue
    }
    const repoName = repoById.get(entry.repoId)?.displayName ?? entry.repoId
    rows.push(
      entry.setups.map((setup) => {
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
          env: buildTestEnvironmentSetupEnv({ setup, ports, publicUrl })
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
    startedAt: Date.now()
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
