import React from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { NotionDiscussion, NotionTicketComment } from '../../../../shared/notion-types'
import { NotionCommentComposer } from './NotionCommentComposer'
import { notionDiscussionHighlightStyle } from './notion-option-color'

export function NotionCommentItem({
  comment
}: {
  comment: NotionTicketComment
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {comment.author ?? translate('auto.components.notion.someone', 'Notion user')}
        </span>
        {comment.createdAt ? <span>{new Date(comment.createdAt).toLocaleString()}</span> : null}
      </div>
      <CommentMarkdown content={comment.body} className="text-xs" />
    </div>
  )
}

/** One discussion: anchored excerpt (inline threads), its comments, and a reply box. */
export function NotionDiscussionThread({
  ticketId,
  discussion,
  showReply
}: {
  ticketId: string
  discussion: NotionDiscussion
  showReply?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {discussion.textContext ? (
        <div
          className="self-start rounded-sm px-1 text-xs text-foreground"
          style={notionDiscussionHighlightStyle()}
        >
          {discussion.textContext}
        </div>
      ) : null}
      {discussion.comments.map((comment) => (
        <NotionCommentItem key={comment.id} comment={comment} />
      ))}
      {showReply ? (
        <NotionCommentComposer
          ticketId={ticketId}
          target={{ kind: 'reply', discussionId: discussion.id }}
          placeholder={translate('auto.components.notion.reply', 'Reply…')}
        />
      ) : null}
    </div>
  )
}
