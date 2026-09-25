import React from 'react'
import { translate } from '@/i18n/i18n'
import type { NotionDiscussion } from '../../../../shared/notion-types'
import { NotionCommentComposer } from './NotionCommentComposer'
import { NotionDiscussionThread } from './NotionDiscussionThread'

/** All open discussions under the ticket body, plus a page-level comment box. */
export function NotionTicketDiscussions({
  ticketId,
  discussions
}: {
  ticketId: string
  discussions: NotionDiscussion[]
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {translate('auto.components.notion.comments', 'Comments ({{value0}})', {
          value0: discussions.length
        })}
      </div>
      {discussions.map((discussion) => (
        <NotionDiscussionThread key={discussion.id} ticketId={ticketId} discussion={discussion} />
      ))}
      <NotionCommentComposer
        ticketId={ticketId}
        target={{ kind: 'page' }}
        placeholder={translate('auto.components.notion.addCommentPlaceholder', 'Add a comment…')}
      />
    </div>
  )
}
