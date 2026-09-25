import { Braces, Loader2, RotateCw } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  LanguageServerKind,
  LanguageServerState
} from '../../../../shared/language-server-types'
import { getLocalLanguageServerRoot } from '../editor/monaco-language-server-client'
import { useLanguageServerStatus } from '../language-servers/use-language-server-status'
import {
  summarizeLanguageServers,
  type LanguageServerSummaryState
} from '../language-servers/language-server-status-summary'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'

function stateLabel(state: LanguageServerSummaryState | LanguageServerState): string {
  switch (state) {
    case 'starting':
      return translate(
        'auto.components.status.bar.LanguageServerStatusSegment.starting',
        'Starting'
      )
    case 'indexing':
      return translate(
        'auto.components.status.bar.LanguageServerStatusSegment.indexing',
        'Indexing'
      )
    case 'ready':
      return translate('auto.components.status.bar.LanguageServerStatusSegment.ready', 'Ready')
    case 'error':
      return translate('auto.components.status.bar.LanguageServerStatusSegment.error', 'Error')
    case 'remote':
      return translate('auto.components.status.bar.LanguageServerStatusSegment.remote', 'Remote')
    case 'idle':
      return translate('auto.components.status.bar.LanguageServerStatusSegment.idle', 'Idle')
  }
}

function serverName(kind: LanguageServerKind): string {
  return kind === 'pyright'
    ? translate(
        'auto.components.status.bar.LanguageServerStatusSegment.pyright',
        'Pyright (Python)'
      )
    : translate(
        'auto.components.status.bar.LanguageServerStatusSegment.typescript',
        'TypeScript (TS/JS)'
      )
}

function StateIndicator({ state }: { state: LanguageServerSummaryState }): React.JSX.Element {
  if (state === 'starting' || state === 'indexing') {
    return <Loader2 aria-hidden className="size-3 animate-spin" />
  }
  return (
    <span
      aria-hidden
      className={cn(
        'size-1.5 rounded-full',
        state === 'ready' && 'bg-status-success',
        state === 'error' && 'bg-destructive',
        (state === 'idle' || state === 'remote') && 'bg-muted-foreground/40'
      )}
    />
  )
}

/** Always-visible status of the active workspace's language servers (Pyright, TypeScript). */
export function LanguageServerStatusSegment({
  iconOnly
}: {
  iconOnly: boolean
}): React.JSX.Element {
  const snapshot = useLanguageServerStatus()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeRootPath = useAppStore((s) =>
    s.activeWorktreeId ? (s.getKnownWorktreeById(s.activeWorktreeId)?.path ?? null) : null
  )
  const localRoot = activeWorktreeId ? getLocalLanguageServerRoot(activeWorktreeId) : null
  const summary = summarizeLanguageServers(snapshot, activeRootPath, localRoot !== null)
  const title = translate(
    'auto.components.status.bar.LanguageServerStatusSegment.title',
    'Language servers'
  )
  const ariaLabel = `${title}, ${stateLabel(summary.state)}`

  const restart = (): void => {
    void window.api.languageServers
      .restart()
      .then(() => (localRoot ? window.api.languageServers.startWorkspace(localRoot) : undefined))
      .catch(() => {})
  }

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              aria-label={ariaLabel}
              data-language-server-state={summary.state}
            >
              <Braces className={cn('size-3', summary.state === 'ready' && 'text-foreground')} />
              {!iconOnly ? (
                <span className="text-[11px] font-medium">
                  {translate('auto.components.status.bar.LanguageServerStatusSegment.label', 'LSP')}
                </span>
              ) : null}
              <StateIndicator state={summary.state} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {ariaLabel}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        side="top"
        align="end"
        sideOffset={8}
        className="w-72"
      >
        <DropdownMenuLabel>
          <span className="flex items-center justify-between gap-3">
            <span>{title}</span>
            <span className="font-normal text-muted-foreground">{stateLabel(summary.state)}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {summary.servers.map((server) => (
          <div key={server.kind} className="flex flex-col gap-0.5 px-2 py-1.5 text-xs">
            <span className="flex items-center justify-between gap-3">
              <span>{serverName(server.kind)}</span>
              <span className="text-muted-foreground">{stateLabel(server.state)}</span>
            </span>
            {server.message ? (
              <span className="truncate text-[11px] text-muted-foreground" title={server.message}>
                {server.message}
              </span>
            ) : null}
            {server.kind === 'pyright' && server.pythonEnvironment !== undefined ? (
              <span
                className="truncate text-[11px] text-muted-foreground"
                data-python-environment={server.pythonEnvironment ?? ''}
              >
                {server.pythonEnvironment
                  ? translate(
                      'auto.components.status.bar.LanguageServerStatusSegment.pythonEnvironment',
                      'Virtualenv: {{environment}}',
                      { environment: server.pythonEnvironment }
                    )
                  : translate(
                      'auto.components.status.bar.LanguageServerStatusSegment.noPythonEnvironment',
                      'No virtualenv found; installed packages are not resolved'
                    )}
              </span>
            ) : null}
          </div>
        ))}
        {summary.servers.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            {summary.state === 'remote'
              ? translate(
                  'auto.components.status.bar.LanguageServerStatusSegment.remoteDescription',
                  'Remote workspace: go to definition stays within the open file.'
                )
              : translate(
                  'auto.components.status.bar.LanguageServerStatusSegment.idleDescription',
                  'No Python or TypeScript project detected in this workspace.'
                )}
          </div>
        ) : null}
        {summary.otherCount > 0 ? (
          <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
            {translate(
              'auto.components.status.bar.LanguageServerStatusSegment.otherWorkspaces',
              '{{count}} more running for other workspaces',
              { count: summary.otherCount }
            )}
          </div>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={restart}>
          <RotateCw className="size-3.5" />
          {translate(
            'auto.components.status.bar.LanguageServerStatusSegment.restart',
            'Restart language servers'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
