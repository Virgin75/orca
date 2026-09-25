import React, { useState } from 'react'
import { ChevronLeft, Link2, Plus, Search } from 'lucide-react'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { NotionTicketSearchForm } from './NotionTicketSearchForm'
import { NotionTicketUrlForm } from './NotionTicketUrlForm'

type PickerMode = 'choose' | 'url' | 'search'

/** "+ Add ticket": pick a ticket by pasted URL or by searching the tickets database. */
export function NotionTicketPicker({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PickerMode>('choose')

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) {
      setMode('choose')
    }
  }
  const close = (): void => handleOpenChange(false)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="workspace-header-no-drag flex shrink-0 items-center gap-1 rounded px-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
          <span>{translate('auto.components.notion.addTicket', 'Add ticket')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(mode === 'choose' ? 'w-56' : 'w-96')}>
        {mode === 'choose' ? (
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem value="url" onSelect={() => setMode('url')}>
                  <Link2 />
                  {translate('auto.components.notion.fromUrl', 'From URL')}
                </CommandItem>
                <CommandItem value="search" onSelect={() => setMode('search')}>
                  <Search />
                  {translate('auto.components.notion.fromSearch', 'From search')}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
              {mode === 'url'
                ? translate('auto.components.notion.fromUrl', 'From URL')
                : translate('auto.components.notion.fromSearch', 'From search')}
            </button>
            {mode === 'url' ? (
              <NotionTicketUrlForm worktreeId={worktreeId} onLinked={close} />
            ) : (
              <NotionTicketSearchForm worktreeId={worktreeId} onLinked={close} />
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
