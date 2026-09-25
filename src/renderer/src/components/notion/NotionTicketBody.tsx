import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type { NotionDiscussion } from '../../../../shared/notion-types'
import { NotionCommentComposer } from './NotionCommentComposer'
import { NotionDiscussionThread } from './NotionDiscussionThread'
import { NotionMarkdown } from './NotionMarkdown'

type Point = { top: number; left: number }

type Floating =
  | { kind: 'selection-hint'; hint: Point; anchor: Point; selection: string }
  | { kind: 'selection-comment'; anchor: Point; selection: string }
  | { kind: 'discussion'; anchor: Point; discussionIds: string[] }

const SNIPPET_EDGE = 20

/** Notion's `selection_with_ellipsis`: short selections verbatim, long ones as "start...end". */
export function toSelectionWithEllipsis(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= SNIPPET_EDGE * 2
    ? flat
    : `${flat.slice(0, SNIPPET_EDGE).trimEnd()}...${flat.slice(-SNIPPET_EDGE).trimStart()}`
}

/** Read mode of a ticket: select text to comment on it, click a highlight to read its thread. */
export function NotionTicketBody({
  ticketId,
  content,
  discussions
}: {
  ticketId: string
  content: string
  discussions: NotionDiscussion[]
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [floating, setFloating] = useState<Floating | null>(null)

  const relativeTo = useCallback((rect: DOMRect): { top: Point; bottom: Point } | null => {
    const container = containerRef.current
    if (!container) {
      return null
    }
    const box = container.getBoundingClientRect()
    const left = rect.left - box.left + rect.width / 2
    return {
      top: { top: rect.top - box.top, left },
      bottom: { top: rect.bottom - box.top, left }
    }
  }, [])

  const handleMouseUp = useCallback((): void => {
    // Why: the selection settles after mouseup, so read it on the next tick.
    setTimeout(() => {
      const selection = window.getSelection()
      const container = containerRef.current
      if (!selection || selection.isCollapsed || !container || selection.rangeCount === 0) {
        return
      }
      const range = selection.getRangeAt(0)
      const text = selection.toString().trim()
      if (!text || !container.contains(range.commonAncestorContainer)) {
        return
      }
      const points = relativeTo(range.getBoundingClientRect())
      if (points) {
        setFloating({
          kind: 'selection-hint',
          hint: points.top,
          anchor: points.bottom,
          selection: toSelectionWithEllipsis(text)
        })
      }
    }, 0)
  }, [relativeTo])

  // Collapsing the selection dismisses the hint, but never an open composer or thread.
  useEffect(() => {
    if (floating?.kind !== 'selection-hint') {
      return
    }
    const onSelectionChange = (): void => {
      if (window.getSelection()?.isCollapsed ?? true) {
        setFloating((current) => (current?.kind === 'selection-hint' ? null : current))
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [floating?.kind])

  const handleDiscussionClick = useCallback(
    (discussionIds: string[], anchor: HTMLElement): void => {
      const points = relativeTo(anchor.getBoundingClientRect())
      if (points) {
        setFloating({ kind: 'discussion', anchor: points.bottom, discussionIds })
      }
    },
    [relativeTo]
  )

  const openThreads =
    floating?.kind === 'discussion'
      ? discussions.filter((discussion) => floating.discussionIds.includes(discussion.id))
      : []
  const popoverOpen = floating?.kind === 'selection-comment' || floating?.kind === 'discussion'

  return (
    <div ref={containerRef} className="relative" onMouseUp={handleMouseUp}>
      <NotionMarkdown content={content} onDiscussionClick={handleDiscussionClick} />
      {floating?.kind === 'selection-hint' ? (
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-full pb-1"
          style={{ top: floating.hint.top, left: floating.hint.left }}
        >
          <Button
            size="xs"
            variant="outline"
            // Why: keep the text selection alive while the button takes the click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              setFloating({
                kind: 'selection-comment',
                anchor: floating.anchor,
                selection: floating.selection
              })
            }
          >
            <MessageSquarePlus />
            {translate('auto.components.notion.addComment', 'Add comment')}
          </Button>
        </div>
      ) : null}
      <Popover open={popoverOpen} onOpenChange={(open) => (open ? undefined : setFloating(null))}>
        <PopoverAnchor asChild>
          <span
            aria-hidden
            className="pointer-events-none absolute size-0"
            style={
              floating && floating.kind !== 'selection-hint'
                ? { top: floating.anchor.top, left: floating.anchor.left }
                : { top: 0, left: 0 }
            }
          />
        </PopoverAnchor>
        <PopoverContent align="center" className="w-80">
          <div className="scrollbar-sleek flex max-h-96 flex-col gap-3 overflow-y-auto p-3">
            {floating?.kind === 'selection-comment' ? (
              <>
                <div className="text-[11px] text-muted-foreground">
                  {translate('auto.components.notion.commentOn', 'Comment on “{{value0}}”', {
                    value0: floating.selection
                  })}
                </div>
                <NotionCommentComposer
                  autoFocus
                  ticketId={ticketId}
                  target={{ kind: 'selection', selection: floating.selection }}
                  placeholder={translate(
                    'auto.components.notion.addCommentPlaceholder',
                    'Add a comment…'
                  )}
                  onPosted={() => setFloating(null)}
                />
              </>
            ) : openThreads.length > 0 ? (
              openThreads.map((discussion) => (
                <NotionDiscussionThread
                  key={discussion.id}
                  ticketId={ticketId}
                  discussion={discussion}
                  showReply
                />
              ))
            ) : (
              <div className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.notion.discussionUnavailable',
                  'This discussion is resolved or no longer available.'
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
