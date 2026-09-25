import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotionMarkdown } from './NotionMarkdown'
import { toSelectionWithEllipsis } from './NotionTicketBody'

const ANCHORED =
  'Résultat a<mark data-discussions="discussion://p/b/d">ttendu :</mark> <script>x()</script>'

describe('NotionMarkdown', () => {
  it('renders discussion anchors as clickable highlights and strips other raw HTML', () => {
    const html = renderToStaticMarkup(
      <NotionMarkdown content={ANCHORED} onDiscussionClick={() => {}} />
    )
    expect(html).toContain('data-notion-discussion-anchor="true"')
    expect(html).toContain('data-discussions="discussion://p/b/d"')
    expect(html).toContain('role="button"')
    expect(html).toContain('ttendu :')
    expect(html).not.toContain('<script')
  })
})

describe('toSelectionWithEllipsis', () => {
  it('keeps short selections verbatim and shortens long ones to start...end', () => {
    expect(toSelectionWithEllipsis('  Résultat\n attendu ')).toBe('Résultat attendu')
    expect(toSelectionWithEllipsis(`${'a'.repeat(20)}MIDDLE${'b'.repeat(20)}`)).toBe(
      `${'a'.repeat(20)}...${'b'.repeat(20)}`
    )
  })
})
