import React, { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { useNotionTicketsStore } from '@/store/notion-tickets'

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** Edit mode: the ticket's Notion-flavored Markdown, saved as minimal line edits. */
export function NotionTicketEditor({
  ticketId,
  baseContent,
  onDone
}: {
  ticketId: string
  baseContent: string
  onDone: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(baseContent)
  const [saving, setSaving] = useState(false)
  const saveContent = useNotionTicketsStore((s) => s.saveContent)
  const dirty = draft !== baseContent

  const save = async (): Promise<void> => {
    if (!dirty || saving) {
      onDone()
      return
    }
    setSaving(true)
    const error = await saveContent(ticketId, baseContent, draft)
    setSaving(false)
    if (error) {
      toast.error(error)
      return
    }
    onDone()
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <Textarea
        autoFocus
        value={draft}
        disabled={saving}
        rows={Math.min(40, Math.max(12, draft.split('\n').length + 2))}
        spellCheck={false}
        aria-label={translate('auto.components.notion.editContent', 'Ticket content')}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          const modifier = isMac ? event.metaKey : event.ctrlKey
          if (event.key === 'Enter' && modifier) {
            event.preventDefault()
            void save()
          } else if (event.key === 'Escape' && !dirty) {
            onDone()
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {translate(
            'auto.components.notion.editHint',
            'Notion-flavored Markdown. Only changed lines are sent to Notion.'
          )}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" disabled={saving} onClick={onDone}>
            {translate('auto.components.notion.cancelEdit', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.notion.saveEdit', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
