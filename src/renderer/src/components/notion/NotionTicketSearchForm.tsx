import React, { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useNotionTicketsStore } from '@/store/notion-tickets'
import type { NotionTicketSearchResult } from '../../../../shared/notion-types'

const SEARCH_DEBOUNCE_MS = 300

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; results: NotionTicketSearchResult[] }
  | { status: 'error'; error: string }

/** "From search" branch of Add ticket: search the tickets database and link several at once. */
export function NotionTicketSearchForm({
  worktreeId,
  onLinked
}: {
  worktreeId: string
  onLinked: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [selected, setSelected] = useState<Map<string, NotionTicketSearchResult>>(new Map())
  const [saving, setSaving] = useState(false)
  const linked = useNotionTicketsStore((s) => s.linksByWorktree[worktreeId])
  const linkTickets = useNotionTicketsStore((s) => s.linkTickets)
  const searchGenerationRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    const generation = ++searchGenerationRef.current
    if (!trimmed) {
      setSearch({ status: 'idle' })
      return
    }
    setSearch({ status: 'loading' })
    const timer = setTimeout(() => {
      void window.api.notion.search(trimmed).then((result) => {
        if (generation !== searchGenerationRef.current) {
          return
        }
        setSearch(
          result.ok
            ? { status: 'ready', results: result.value }
            : { status: 'error', error: result.error }
        )
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const toggle = (ticket: NotionTicketSearchResult): void => {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(ticket.id)) {
        next.delete(ticket.id)
      } else {
        next.set(ticket.id, ticket)
      }
      return next
    })
  }

  const handleValidate = async (): Promise<void> => {
    setSaving(true)
    try {
      await linkTickets(worktreeId, [...selected.values()])
      onLinked()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const results = search.status === 'ready' ? search.results : []

  return (
    <Command shouldFilter={false}>
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={translate('auto.components.notion.searchTickets', 'Search tickets…')}
        trailing={
          search.status === 'loading' ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : null
        }
      />
      <CommandList>
        {search.status === 'error' ? (
          <div className="px-3 py-4 text-center text-xs text-destructive">{search.error}</div>
        ) : search.status === 'ready' ? (
          <CommandEmpty>
            {translate('auto.components.notion.noTickets', 'No matching tickets')}
          </CommandEmpty>
        ) : search.status === 'idle' ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.notion.searchHint',
              'Type to search the Tasks database. The first search may open Notion sign-in in your browser.'
            )}
          </div>
        ) : null}
        {results.length > 0 ? (
          <CommandGroup>
            {results.map((ticket) => {
              const alreadyLinked = linked?.some((entry) => entry.id === ticket.id) ?? false
              const checked = alreadyLinked || selected.has(ticket.id)
              return (
                <CommandItem
                  key={ticket.id}
                  value={ticket.id}
                  disabled={alreadyLinked}
                  onSelect={() => toggle(ticket)}
                >
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-border',
                      checked && 'border-primary bg-primary text-primary-foreground'
                    )}
                  >
                    {checked ? <Check className="size-2.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                  {ticket.timestamp ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {ticket.timestamp.replace(/\s*\(.*\)$/, '')}
                    </span>
                  ) : null}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {translate('auto.components.notion.selectedCount', '{{value0}} selected', {
            value0: selected.size
          })}
        </span>
        <Button
          size="sm"
          disabled={selected.size === 0 || saving}
          onClick={() => void handleValidate()}
        >
          {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {translate('auto.components.notion.linkTickets', 'Link tickets')}
        </Button>
      </div>
    </Command>
  )
}
