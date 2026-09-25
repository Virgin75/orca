import React, { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { useNotionTicketsStore } from '@/store/notion-tickets'
import type { NotionCommentTarget } from '../../../../shared/notion-types'

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** Comment box shared by page comments, selection comments, and thread replies. */
export function NotionCommentComposer({
  ticketId,
  target,
  placeholder,
  autoFocus,
  onPosted
}: {
  ticketId: string
  target: NotionCommentTarget
  placeholder: string
  autoFocus?: boolean
  onPosted?: () => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const addComment = useNotionTicketsStore((s) => s.addComment)

  const submit = async (): Promise<void> => {
    if (!body.trim() || posting) {
      return
    }
    setPosting(true)
    const error = await addComment(ticketId, body, target)
    setPosting(false)
    if (error) {
      toast.error(error)
      return
    }
    setBody('')
    onPosted?.()
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus={autoFocus}
        value={body}
        placeholder={placeholder}
        disabled={posting}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          const modifier = isMac ? event.metaKey : event.ctrlKey
          if (event.key === 'Enter' && modifier && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={!body.trim() || posting} onClick={() => void submit()}>
          {posting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {translate('auto.components.notion.postComment', 'Comment')}
        </Button>
      </div>
    </div>
  )
}
