import React, { useEffect } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useAppStore } from '@/store'
import { NotionIcon } from '@/components/icons/NotionIcon'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { isNotionAvailable, useNotionTicketsStore } from '@/store/notion-tickets'
import type { NotionLinkedTicket } from '../../../../shared/notion-types'
import { NotionPriorityBadge, NotionStatusPicker } from './NotionTicketBadges'
import { NotionTicketPicker } from './NotionTicketPicker'
import { WorkspaceHeaderSourceBadge } from '../workspace-header/WorkspaceHeaderSourceBadge'
import { useHeaderRefreshTick } from '../workspace-header/use-header-refresh-tick'

// Why: statuses change from Notion itself (teammates, automations); one fetch per ticket per minute.
const NOTION_REFRESH_INTERVAL_MS = 60_000

/** Top line of the workspace header: Notion tickets linked to this workspace. */
export function WorkspaceNotionTicketsBar({
  worktreeId,
  isWorktreeActive
}: {
  worktreeId: string
  isWorktreeActive: boolean
}): React.JSX.Element | null {
  const linked = useNotionTicketsStore((s) => s.linksByWorktree[worktreeId])
  const loadLinks = useNotionTicketsStore((s) => s.loadLinks)
  const refreshLinkedTickets = useNotionTicketsStore((s) => s.refreshLinkedTickets)
  const available = isNotionAvailable()
  const refreshTick = useHeaderRefreshTick(
    available && isWorktreeActive && (linked?.length ?? 0) > 0,
    NOTION_REFRESH_INTERVAL_MS
  )

  useEffect(() => {
    if (available && isWorktreeActive) {
      void loadLinks(worktreeId)
    }
  }, [available, isWorktreeActive, loadLinks, worktreeId])

  useEffect(() => {
    if (refreshTick > 0) {
      void refreshLinkedTickets(worktreeId)
    }
  }, [refreshLinkedTickets, refreshTick, worktreeId])

  if (!available) {
    return null
  }
  const tickets = linked ?? []
  const single = tickets.length === 1
  return (
    <div className="flex h-5 min-w-0 items-center gap-2 overflow-hidden text-xs">
      <WorkspaceHeaderSourceBadge icon={<NotionIcon />} label="Notion" />
      {tickets.length > 0 ? (
        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5',
            single ? 'overflow-hidden' : 'overflow-x-auto scrollbar-none'
          )}
        >
          {tickets.map((ticket) => (
            <NotionTicketChip
              key={ticket.id}
              worktreeId={worktreeId}
              linked={ticket}
              single={single}
            />
          ))}
        </div>
      ) : null}
      <NotionTicketPicker worktreeId={worktreeId} />
    </div>
  )
}

function NotionTicketChip({
  worktreeId,
  linked,
  single
}: {
  worktreeId: string
  linked: NotionLinkedTicket
  /** A lone ticket renders unboxed and only truncates at the header's far edge. */
  single: boolean
}): React.JSX.Element {
  const ticket = useNotionTicketsStore((s) => s.ticketsById[linked.id])
  const error = useNotionTicketsStore((s) => s.ticketErrors[linked.id])
  const setActiveTicket = useNotionTicketsStore((s) => s.setActiveTicket)
  const setRightSidebarOpen = useAppStore((s) => s.setRightSidebarOpen)
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab)
  const title = ticket?.title ?? linked.title

  const openTicket = (): void => {
    setActiveTicket(worktreeId, linked.id)
    setRightSidebarOpen(true)
    setRightSidebarTab('notion')
  }

  return (
    <div
      className={cn(
        'workspace-header-no-drag flex min-w-0 items-center gap-1 leading-4',
        !single && 'shrink-0 rounded-md border border-border px-1'
      )}
    >
      {ticket?.priority ? <NotionPriorityBadge priority={ticket.priority} /> : null}
      <button
        type="button"
        onClick={openTicket}
        title={error ?? title}
        aria-label={translate('auto.components.notion.openTicket', 'Open ticket {{value0}}', {
          value0: title
        })}
        className={cn(
          'min-w-0 truncate rounded px-0.5 text-left font-medium text-foreground hover:underline',
          !single && 'max-w-96'
        )}
      >
        {title}
      </button>
      {ticket ? (
        <NotionStatusPicker ticket={ticket} />
      ) : error ? (
        <TriangleAlert className="size-3 shrink-0 text-destructive" aria-label={error} />
      ) : (
        <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
