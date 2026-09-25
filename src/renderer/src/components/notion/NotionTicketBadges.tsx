import React from 'react'
import { Check, ChevronDown, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useNotionTicketsStore } from '@/store/notion-tickets'
import type { NotionPropertyOption, NotionTicketSummary } from '../../../../shared/notion-types'
import {
  notionOptionBadgeStyle,
  notionOptionDotStyle,
  notionOptionTextStyle
} from './notion-option-color'

export function NotionPriorityBadge({
  priority
}: {
  priority: NotionPropertyOption
}): React.JSX.Element {
  return (
    <span
      className="shrink-0 font-semibold"
      style={notionOptionTextStyle(priority.color)}
      title={translate('auto.components.notion.priority', 'Priority')}
    >
      {priority.name}
    </span>
  )
}

/** Colored status pill that opens the ticket's status options for an inline edit. */
export function NotionStatusPicker({
  ticket
}: {
  ticket: NotionTicketSummary
}): React.JSX.Element | null {
  const updateStatus = useNotionTicketsStore((s) => s.updateStatus)
  const pending = useNotionTicketsStore((s) => Boolean(s.pendingStatusIds[ticket.id]))
  const status = ticket.status
  if (!status) {
    return null
  }
  const editable = ticket.statusOptions.length > 0

  const handleSelect = (name: string): void => {
    void updateStatus(ticket.id, name).then((error) => {
      if (error) {
        toast.error(error)
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={!editable || pending}>
        <button
          type="button"
          aria-label={translate('auto.components.notion.editStatus', 'Change status')}
          className="flex shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium leading-4 transition hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100"
          style={notionOptionBadgeStyle(status.color)}
          onClick={(event) => event.stopPropagation()}
        >
          {pending ? (
            <LoaderCircle className="size-2.5 animate-spin" />
          ) : (
            <span className="size-1.5 rounded-full" style={notionOptionDotStyle(status.color)} />
          )}
          <span className="max-w-32 truncate">{status.name}</span>
          {editable ? <ChevronDown className="size-2.5 opacity-70" /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72">
        {ticket.statusOptions.map((option) => (
          <DropdownMenuItem key={option.name} onSelect={() => handleSelect(option.name)}>
            <span className="size-2 rounded-full" style={notionOptionDotStyle(option.color)} />
            <span className="flex-1 truncate">{option.name}</span>
            {option.name === status.name ? <Check className="size-3" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
