import React, { useEffect, useMemo } from 'react'
import { Globe, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useTestEnvironmentRunsStore } from '@/store/test-environment-runs'
import { launchTestEnvironment, stopTestEnvironment } from '@/lib/launch-test-environment'
import {
  resolveTestEnvironmentRepoDirectories,
  type TestEnvironmentDirectoryChoice
} from '@/lib/test-environment-directories'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'
import {
  TestEnvironmentLaunchCard,
  type TestEnvironmentLaunchRepoRow
} from '@/components/test-environments/TestEnvironmentLaunchCard'
import { TestEnvironmentRunView } from '@/components/test-environments/TestEnvironmentRunView'
import { useTestEnvironmentPaneStatus } from '@/components/test-environments/use-test-environment-pane-status'
import { testEnvironmentIncludesRepo } from '../../../../shared/test-environments'
import type { TestEnvironment } from '../../../../shared/test-environment-types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function TestEnvironmentPanel({
  isVisible
}: {
  isVisible: boolean
}): React.JSX.Element {
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const worktree = useAppStore((s) => (worktreeId ? s.getKnownWorktreeById(worktreeId) : null))
  const currentRepo = useRepoById(worktree?.repoId ?? null)
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const testEnvironments = useAppStore((s) => s.settings?.testEnvironments)
  const run = useTestEnvironmentRunsStore((s) =>
    worktreeId ? s.runsByWorktree[worktreeId] : undefined
  )
  const workspaceTabs = useAppStore((s) => (worktreeId ? s.tabsByWorktree[worktreeId] : undefined))
  const statuses = useTestEnvironmentPaneStatus(run, isVisible)

  // Why: closing the run's terminal tab by hand ends the run.
  useEffect(() => {
    if (run && workspaceTabs && !workspaceTabs.some((tab) => tab.id === run.tabId)) {
      useTestEnvironmentRunsStore.getState().clearRun(run.worktreeId)
    }
  }, [run, workspaceTabs])

  const available = useMemo(
    () =>
      worktree
        ? (testEnvironments ?? []).filter((env) =>
            testEnvironmentIncludesRepo(env, worktree.repoId)
          )
        : [],
    [testEnvironments, worktree]
  )

  const openSettings = (): void => {
    const store = useAppStore.getState()
    store.openSettingsTarget({ pane: 'test-environments', repoId: null })
    store.openSettingsPage()
  }

  if (!worktreeId || !worktree) {
    return (
      <PanelMessage>
        {translate('auto.components.testEnvironments.noWorkspace', 'Select a workspace first.')}
      </PanelMessage>
    )
  }

  const rowsFor = (env: TestEnvironment): TestEnvironmentLaunchRepoRow[] =>
    env.repos
      .filter((entry) => entry.setups.length > 0)
      .map((entry) => {
        const repo = repos.find((candidate) => candidate.id === entry.repoId)
        return {
          entryId: entry.id,
          repoName: repo?.displayName ?? entry.repoId,
          setupNames: entry.setups.map((setup) => setup.name),
          directories: resolveTestEnvironmentRepoDirectories({
            repoId: entry.repoId,
            repo,
            currentWorktree: worktree,
            currentRepo,
            worktrees: worktreesByRepo[entry.repoId]
          })
        }
      })

  const launch = async (
    env: TestEnvironment,
    directories: Record<string, TestEnvironmentDirectoryChoice>,
    isCustom = false
  ): Promise<boolean> => {
    try {
      await launchTestEnvironment({ env, worktreeId, directories, isCustom })
      return true
    } catch (error) {
      toast.error(
        translate('auto.components.testEnvironments.launchFailed', 'Could not launch test env'),
        { description: errorMessage(error) }
      )
      return false
    }
  }

  const showTerminal = (tabId: string): void => {
    const store = useAppStore.getState()
    store.setActiveTab(tabId)
    store.setActiveTabType('terminal')
  }

  const openUrl = (url: string): void => {
    void openWorkspaceBrowserTab({
      workspaceId: worktreeId,
      url,
      intent: { kind: 'url' }
    }).catch((error: unknown) => toast.error(errorMessage(error)))
  }

  const restart = (): void => {
    if (!run) {
      return
    }
    // Why: a custom launch restarts with its one-off values, not the saved test env.
    const env =
      run.customEnv ?? (testEnvironments ?? []).find((candidate) => candidate.id === run.envId)
    if (!env) {
      toast.error(
        translate(
          'auto.components.testEnvironments.envRemoved',
          'This test env no longer exists in Settings.'
        )
      )
      return
    }
    const directories: Record<string, TestEnvironmentDirectoryChoice> = {}
    for (const entry of env.repos) {
      const pane = run.panes.find((candidate) => candidate.repoId === entry.repoId)
      if (pane) {
        directories[entry.id] = { kind: 'path', path: pane.cwd }
      }
    }
    void launch(env, directories, Boolean(run.customEnv))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3">
        <Globe className="size-3.5 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium">
          {translate('auto.components.testEnvironments.title', 'Test env')}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={translate(
                'auto.components.testEnvironments.manage',
                'Manage test environments'
              )}
              onClick={openSettings}
            >
              <Settings2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('auto.components.testEnvironments.manage', 'Manage test environments')}
          </TooltipContent>
        </Tooltip>
      </div>
      {run ? (
        <TestEnvironmentRunView
          run={run}
          statuses={statuses}
          onOpenUrl={openUrl}
          onOpenUrlExternally={(url) => void window.api.shell.openUrl(url)}
          onShowTerminal={() => showTerminal(run.tabId)}
          onRestart={restart}
          onStop={() => stopTestEnvironment(run)}
        />
      ) : available.length === 0 ? (
        <PanelMessage>
          {translate(
            'auto.components.testEnvironments.empty',
            'No test environment includes this repository yet.'
          )}
          <div className="mt-3">
            <Button size="xs" variant="outline" onClick={openSettings}>
              {translate('auto.components.testEnvironments.create', 'Create a test env')}
            </Button>
          </div>
        </PanelMessage>
      ) : (
        <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {available.map((env) => (
            <TestEnvironmentLaunchCard
              key={env.id}
              env={env}
              rows={rowsFor(env)}
              onLaunch={(directories, customEnv) =>
                launch(customEnv ?? env, directories, Boolean(customEnv))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PanelMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-4 py-8 text-center text-xs text-muted-foreground">{children}</div>
}
