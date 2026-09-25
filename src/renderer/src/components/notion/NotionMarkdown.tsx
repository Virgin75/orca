import React from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { documentCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'
import { notionDiscussionHighlightStyle } from './notion-option-color'

// Why: the parser wraps discussion-anchored text in <mark data-discussions>; allow only that on top of the defaults.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark', 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    mark: ['dataDiscussions'],
    img: [...(defaultSchema.attributes?.img ?? []), 'src', 'alt', 'title'],
    input: [...(defaultSchema.attributes?.input ?? []), 'type', 'checked', 'disabled']
  }
}

const remarkPlugins = [remarkGfm, remarkBreaks]
const rehypePlugins: NonNullable<React.ComponentProps<typeof Markdown>['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema]
]

export type NotionDiscussionClickHandler = (discussionIds: string[], anchor: HTMLElement) => void

/** Ticket content renderer: document typography plus clickable comment highlights. */
export const NotionMarkdown = React.memo(function NotionMarkdown({
  content,
  onDiscussionClick
}: {
  content: string
  onDiscussionClick: NotionDiscussionClickHandler
}): React.JSX.Element {
  const components = React.useMemo<Components>(
    () => ({
      ...documentCommentMarkdownComponents,
      mark: ({ children, ...props }) => {
        const raw: unknown = Reflect.get(props, 'data-discussions')
        const ids = typeof raw === 'string' ? raw.split(/[\s,]+/).filter(Boolean) : []
        const open = (target: HTMLElement): void => onDiscussionClick(ids, target)
        return (
          <span
            role="button"
            tabIndex={0}
            data-notion-discussion-anchor="true"
            data-discussions={ids.join(' ')}
            className="cursor-pointer rounded-sm"
            style={notionDiscussionHighlightStyle()}
            onClick={(event) => open(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                open(event.currentTarget)
              }
            }}
          >
            {children}
          </span>
        )
      }
    }),
    [onDiscussionClick]
  )
  return (
    <div className="min-w-0 max-w-full text-[13px] [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={defaultUrlTransform}
      >
        {content}
      </Markdown>
    </div>
  )
})
