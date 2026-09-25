import React from 'react'
import { Copy, ExternalLink, Globe, RotateCw, Square, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { TestEnvironmentRun } from '@/store/test-environment-runs'
import type { TestEnvironmentPaneStatus } from './use-test-environment-pane-status'

const STATUS_TONE: Record<TestEnvironmentPaneStatus, string> = {
  starting: 'bg-workspace-status-progress',
  running: 'bg-status-success',
  stopped: 'bg-destructive'
}

function statusLabel(status: TestEnvironmentPaneStatus): string {
  if (status === 'running') {
    return translate('auto.components.testEnvironments.statusRunning', 'Running')
  }
  if (status === 'stopped') {
    return translate('auto.components.testEnvironments.statusStopped', 'Stopped')
  }
  return translate('auto.components.testEnvironments.statusStarting', 'Starting')
}

export function overallTestEnvironmentStatus(
  run: TestEnvironmentRun,
  statuses: Record<string, TestEnvironmentPaneStatus>
): TestEnvironmentPaneStatus {
  const values = run.panes.map((pane) => statuses[pane.leafId] ?? 'starting')
  if (values.some((value) => value === 'stopped')) {
    return 'stopped'
  }
  return values.every((value) => value === 'running') ? 'running' : 'starting'
}

function copyText(value: string): void {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(translate('auto.components.testEnvironments.copied', 'Copied')))
    .catch(() => undefined)
}

export function TestEnvironmentRunView({
  run,
  statuses,
  onOpenUrl,
  onOpenUrlExternally,
  onShowTerminal,
  onRestart,
  onStop
}: {
  run: TestEnvironmentRun
  statuses: Record<string, TestEnvironmentPaneStatus>
  onOpenUrl: (url: string) => void
  onOpenUrlExternally: (url: string) => void
  onShowTerminal: () => void
  onRestart: () => void
  onStop: () => void
}): React.JSX.Element {
  const overall = overallTestEnvironmentStatus(run, statuses)
  const repoGroups = new Map<string, TestEnvironmentRun['panes']>()
  for (const pane of run.panes) {
    repoGroups.set(pane.repoName, [...(repoGroups.get(pane.repoName) ?? []), pane])
  }
  const portEntries = Object.entries(run.ports)

  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: run.color }} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{run.envName}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', STATUS_TONE[overall])} />
            {statusLabel(overall)}
          </span>
        </div>
        {run.publicUrl ? (
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => onOpenUrl(run.publicUrl)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-medium text-foreground hover:bg-accent"
              title={translate(
                'auto.components.testEnvironments.openInOrcaBrowser',
                'Open in Orca browser'
              )}
            >
              <Globe className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate underline-offset-2 hover:underline">{run.publicUrl}</span>
            </button>
            <IconAction
              label={translate(
                'auto.components.testEnvironments.openInSystemBrowser',
                'Open in system browser'
              )}
              onClick={() => onOpenUrlExternally(run.publicUrl)}
            >
              <ExternalLink className="size-3.5" />
            </IconAction>
            <IconAction
              label={translate('auto.components.testEnvironments.copyUrl', 'Copy URL')}
              onClick={() => copyText(run.publicUrl)}
            >
              <Copy className="size-3.5" />
            </IconAction>
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <Button size="xs" variant="outline" onClick={onShowTerminal}>
            <SquareTerminal />
            {translate('auto.components.testEnvironments.showTerminal', 'Show terminal')}
          </Button>
          <Button size="xs" variant="ghost" onClick={onRestart}>
            <RotateCw />
            {translate('auto.components.testEnvironments.restart', 'Restart')}
          </Button>
          <div className="ml-auto">
            <Button size="xs" variant="ghost" onClick={onStop}>
              <Square />
              {translate('auto.components.testEnvironments.stop', 'Stop')}
            </Button>
          </div>
        </div>
      </div>

      {portEntries.length > 0 ? (
        <section className="border-b border-border p-3">
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {translate('auto.components.testEnvironments.ports', 'Ports')}
          </h3>
          <div className="flex flex-wrap gap-1">
            {portEntries.map(([name, port]) => (
              <button
                key={name}
                type="button"
                onClick={() => copyText(String(port))}
                title={translate('auto.components.testEnvironments.copyPort', 'Copy port')}
                className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
              >
                <span className="text-muted-foreground">{name}</span>
                <span>{port}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 p-3">
        {[...repoGroups.entries()].map(([repoName, panes]) => (
          <div key={repoName}>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">{repoName}</h3>
            <ul className="flex flex-col">
              {panes.map((pane) => {
                const status = statuses[pane.leafId] ?? 'starting'
                return (
                  <li
                    key={pane.leafId}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-xs"
                    title={pane.cwd}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_TONE[status])} />
                    <span className="min-w-0 flex-1 truncate">{pane.setupName}</span>
                    <span className="text-muted-foreground">{statusLabel(status)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

function IconAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
