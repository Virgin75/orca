import React, { useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, Pencil, RefreshCw, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NotionIcon } from '@/components/icons/NotionIcon'
import { NotionPriorityBadge, NotionStatusPicker } from '@/components/notion/NotionTicketBadges'
import { NotionTicketPicker } from '@/components/notion/NotionTicketPicker'
import { notionOptionDotStyle } from '@/components/notion/notion-option-color'
import { NotionTicketBody } from '@/components/notion/NotionTicketBody'
import { NotionTicketEditor } from '@/components/notion/NotionTicketEditor'
import { NotionTicketDiscussions } from '@/components/notion/NotionTicketDiscussions'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { isNotionAvailable, useNotionTicketsStore } from '@/store/notion-tickets'
import type { NotionLinkedTicket } from '../../../../shared/notion-types'

export default function NotionTicketsPanel(): React.JSX.Element {
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const linked = useNotionTicketsStore((s) =>
    worktreeId ? s.linksByWorktree[worktreeId] : undefined
  )
  const activeId = useNotionTicketsStore((s) =>
    worktreeId ? s.activeTicketByWorktree[worktreeId] : undefined
  )
  const loadLinks = useNotionTicketsStore((s) => s.loadLinks)
  const setActiveTicket = useNotionTicketsStore((s) => s.setActiveTicket)

  useEffect(() => {
    if (worktreeId) {
      void loadLinks(worktreeId)
    }
  }, [loadLinks, worktreeId])

  if (!isNotionAvailable() || !worktreeId) {
    return (
      <PanelMessage>
        {translate(
          'auto.components.notion.unavailable',
          'Notion tickets are available in the desktop app.'
        )}
      </PanelMessage>
    )
  }

  const tickets = linked ?? []
  const current = tickets.find((ticket) => ticket.id === activeId) ?? tickets[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <div
          role="tablist"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none"
        >
          {tickets.map((ticket) => (
            <NotionTicketTab
              key={ticket.id}
              ticket={ticket}
              active={ticket.id === current?.id}
              onSelect={() => setActiveTicket(worktreeId, ticket.id)}
            />
          ))}
        </div>
        <div className="shrink-0 text-xs">
          <NotionTicketPicker worktreeId={worktreeId} />
        </div>
      </div>
      {current ? (
        <NotionTicketView key={current.id} worktreeId={worktreeId} linked={current} />
      ) : (
        <PanelMessage>
          <NotionIcon className="mx-auto mb-2 size-6 text-muted-foreground" />
          {translate(
            'auto.components.notion.empty',
            'No Notion tickets linked to this workspace yet. Use Add ticket to link some.'
          )}
        </PanelMessage>
      )}
    </div>
  )
}

function PanelMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-4 py-8 text-center text-xs text-muted-foreground">{children}</div>
}

function NotionTicketTab({
  ticket,
  active,
  onSelect
}: {
  ticket: NotionLinkedTicket
  active: boolean
  onSelect: () => void
}): React.JSX.Element {
  const summary = useNotionTicketsStore((s) => s.ticketsById[ticket.id])
  const title = summary?.title ?? ticket.title
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-current={active ? 'true' : undefined}
      onClick={onSelect}
      title={title}
      className={cn(
        'flex h-6 max-w-40 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground',
        active && 'bg-accent font-medium text-foreground'
      )}
    >
      {summary?.status ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={notionOptionDotStyle(summary.status.color)}
        />
      ) : null}
      <span className="truncate">{title}</span>
    </button>
  )
}

function NotionTicketView({
  worktreeId,
  linked
}: {
  worktreeId: string
  linked: NotionLinkedTicket
}): React.JSX.Element {
  const entry = useNotionTicketsStore((s) => s.detailsById[linked.id])
  const summary = useNotionTicketsStore((s) => s.ticketsById[linked.id])
  const loadDetail = useNotionTicketsStore((s) => s.loadDetail)
  const unlinkTicket = useNotionTicketsStore((s) => s.unlinkTicket)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    void loadDetail(linked.id)
  }, [linked.id, loadDetail])

  const detail = entry?.detail ?? null
  const ticket = summary ?? detail?.ticket
  const url = ticket?.url ?? linked.url
  const loading = entry?.state === 'loading'

  const handleUnlink = (): void => {
    void unlinkTicket(worktreeId, linked.id).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error))
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <div className="text-sm font-semibold leading-5 text-foreground">
          {ticket?.title ?? linked.title}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {ticket ? <NotionStatusPicker ticket={ticket} /> : null}
          {ticket?.priority ? <NotionPriorityBadge priority={ticket.priority} /> : null}
          <div className="flex-1" />
          <IconAction
            label={
              editing
                ? translate('auto.components.notion.exitEdit', 'Exit edit mode')
                : translate('auto.components.notion.edit', 'Edit')
            }
            pressed={editing}
            disabled={!detail}
            onClick={() => setEditing((value) => !value)}
          >
            <Pencil className="size-3.5" />
          </IconAction>
          <IconAction
            label={translate('auto.components.notion.refresh', 'Refresh')}
            disabled={loading || editing}
            onClick={() => void loadDetail(linked.id, { force: true })}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </IconAction>
          <IconAction
            label={translate('auto.components.notion.openInNotion', 'Open in Notion')}
            onClick={() => void window.api.shell.openUrl(url)}
          >
            <ExternalLink className="size-3.5" />
          </IconAction>
          <IconAction
            label={translate('auto.components.notion.unlink', 'Unlink from workspace')}
            onClick={handleUnlink}
          >
            <Unlink className="size-3.5" />
          </IconAction>
        </div>
      </div>
      {entry?.state === 'error' ? (
        <div className="px-3 py-2 text-xs text-destructive">{entry.error}</div>
      ) : null}
      {!detail && loading ? (
        <div className="flex items-center justify-center py-8">
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {detail && editing ? (
        <NotionTicketEditor
          ticketId={linked.id}
          baseContent={detail.rawContent}
          onDone={() => setEditing(false)}
        />
      ) : null}
      {detail && !editing ? (
        <>
          <div className="px-3 py-3">
            {detail.content ? (
              <NotionTicketBody
                ticketId={linked.id}
                content={detail.content}
                discussions={detail.discussions}
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                {translate('auto.components.notion.noContent', 'This ticket has no content.')}
              </div>
            )}
          </div>
          <NotionTicketDiscussions ticketId={linked.id} discussions={detail.discussions} />
        </>
      ) : null}
    </div>
  )
}

function IconAction({
  label,
  pressed,
  disabled,
  onClick,
  children
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={pressed ? 'secondary' : 'ghost'}
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
