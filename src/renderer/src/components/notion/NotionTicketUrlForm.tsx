import React, { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { useNotionTicketsStore } from '@/store/notion-tickets'

/** "From URL" branch of Add ticket: paste a Notion page link and link it. */
export function NotionTicketUrlForm({
  worktreeId,
  onLinked
}: {
  worktreeId: string
  onLinked: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const linkTicketFromUrl = useNotionTicketsStore((s) => s.linkTicketFromUrl)

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || saving) {
      return
    }
    setSaving(true)
    setError(null)
    const failure = await linkTicketFromUrl(worktreeId, trimmed)
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    onLinked()
  }

  return (
    <form className="flex flex-col gap-2 p-3" onSubmit={(event) => void submit(event)}>
      <Input
        autoFocus
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={translate(
          'auto.components.notion.urlPlaceholder',
          'https://www.notion.so/… ticket URL'
        )}
        aria-invalid={error ? true : undefined}
      />
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!url.trim() || saving}>
          {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {translate('auto.components.notion.linkTicket', 'Link ticket')}
        </Button>
      </div>
    </form>
  )
}
