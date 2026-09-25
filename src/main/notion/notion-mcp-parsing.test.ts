import { describe, expect, it } from 'vitest'
import {
  normalizeNotionId,
  notionMarkupToMarkdown,
  parseComments,
  parseDataSourceSchema,
  parseDiscussions,
  parseFetchedPage,
  parseSearchResults
} from './notion-mcp-parsing'
import { buildTicketSummary } from './notion-tickets'

const SEARCH_TEXT = JSON.stringify({
  results: [
    {
      id: '14b98940-b24a-8038-a59a-e32970ccbe17',
      title: '[IMM] Document integration CARE',
      url: 'https://app.notion.com/p/14b98940b24a8038a59ae32970ccbe17?pvs=204',
      type: 'page',
      timestamp: '8 months ago (2026-01-06)'
    },
    {
      id: 'google-drive://x',
      title: 'Doc.docx',
      url: 'https://docs.google.com',
      type: 'google-drive'
    }
  ],
  type: 'ai_search'
})

const PAGE_BODY = [
  '<page url="https://app.notion.com/p/31798940b24a80b6b6edc41dbe614b47" icon="icons/link_gray">',
  '<ancestor-path>',
  '<parent-data-source url="collection://4e7ef2d3-a6f0-48df-bcce-d16362ff6e91" name="Tasks"/>',
  '</ancestor-path>',
  '<properties>',
  '{"Status":"En cours","Priority":"P1","Title":"Analyse"}',
  '</properties>',
  '<content>',
  '<callout color="gray_bg">',
  '\t<span underline="true">Tips</span>',
  '\t- [ ] Add the US',
  '</callout>',
  '### Context',
  'Line one<br><br>**Deadline**',
  '<empty-block/>',
  '</content>',
  '</page>'
].join('\n')

const PAGE_TEXT = JSON.stringify({
  metadata: { type: 'page' },
  title: 'Analyse  ',
  url: 'https://app.notion.com/p/31798940b24a80b6b6edc41dbe614b47?pvs=204',
  text: PAGE_BODY
})

const SCHEMA_TEXT = JSON.stringify({
  text: `<data-source url="collection://x">\n<data-source-state>\n${JSON.stringify({
    name: 'Tasks',
    schema: {
      Status: {
        name: 'Status',
        type: 'status',
        groups: {
          to_do: [{ name: 'Pas commencé', color: 'default' }],
          in_progress: [{ name: 'En cours', color: 'orange' }],
          complete: [{ name: 'Done', color: 'green' }]
        }
      },
      Priority: {
        name: 'Priority',
        type: 'select',
        options: [
          { name: 'P1', color: 'red' },
          { name: 'P2', color: 'orange' }
        ]
      },
      Title: { name: 'Title', type: 'title' }
    }
  })}\n</data-source-state>`
})

describe('notion MCP parsing', () => {
  it('keeps only page results and strips the tracking suffix from URLs', () => {
    expect(parseSearchResults(SEARCH_TEXT)).toEqual([
      {
        id: '14b98940-b24a-8038-a59a-e32970ccbe17',
        title: '[IMM] Document integration CARE',
        url: 'https://app.notion.com/p/14b98940b24a8038a59ae32970ccbe17',
        timestamp: '8 months ago (2026-01-06)'
      }
    ])
  })

  it('reads title, properties, parent data source and content from a fetched page', () => {
    const page = parseFetchedPage(PAGE_TEXT)
    expect(page.title).toBe('Analyse')
    expect(page.url).toBe('https://app.notion.com/p/31798940b24a80b6b6edc41dbe614b47')
    expect(page.properties.Status).toBe('En cours')
    expect(page.dataSourceUrl).toBe('collection://4e7ef2d3-a6f0-48df-bcce-d16362ff6e91')
    expect(page.content).toContain('### Context')
  })

  it('flattens status groups and select options with their colors', () => {
    const schema = parseDataSourceSchema(SCHEMA_TEXT)
    expect(schema.find((p) => p.name === 'Status')?.options).toEqual([
      { name: 'Pas commencé', color: 'default' },
      { name: 'En cours', color: 'orange' },
      { name: 'Done', color: 'green' }
    ])
    expect(schema.find((p) => p.name === 'Priority')?.type).toBe('select')
  })

  it('builds a ticket summary with colored status, priority and status options', () => {
    const summary = buildTicketSummary(
      'id-1',
      parseFetchedPage(PAGE_TEXT),
      parseDataSourceSchema(SCHEMA_TEXT)
    )
    expect(summary.status).toEqual({ name: 'En cours', color: 'orange', propertyName: 'Status' })
    expect(summary.priority).toEqual({ name: 'P1', color: 'red' })
    expect(summary.statusOptions).toHaveLength(3)
  })

  it('parses comment author email, date and body', () => {
    const text = JSON.stringify({
      text: '<discussions><discussion id="d"><comment id="c1" user-url="user://302d/pierre@codoc.co" datetime="2026-03-09T13:07:27.186Z">Notes<br><br>  • Weekly</comment></discussion></discussions>'
    })
    expect(parseComments(text)).toEqual([
      {
        id: 'c1',
        author: 'pierre@codoc.co',
        createdAt: '2026-03-09T13:07:27.186Z',
        body: 'Notes  \n  \n  • Weekly'
      }
    ])
  })

  it('converts Notion markup to Markdown without tab-indented code blocks', () => {
    const markdown = notionMarkupToMarkdown(parseFetchedPage(PAGE_TEXT).content)
    expect(markdown).toContain('> Tips')
    expect(markdown).toContain('> - [ ] Add the US')
    expect(markdown).not.toContain('\t')
    expect(markdown).not.toContain('<empty-block')
  })

  it('normalizes dashed and undashed page ids', () => {
    expect(normalizeNotionId('31798940b24a80b6b6edc41dbe614b47')).toBe(
      '31798940-b24a-80b6-b6ed-c41dbe614b47'
    )
  })

  it('reads the id from a slugged Notion URL even when the slug ends in hex letters', () => {
    expect(
      normalizeNotionId(
        'https://app.notion.com/p/codoc/B-Donn-es-limit-s-mes-patients-3e498940b24a8044a864e1da18a7203d'
      )
    ).toBe('3e498940-b24a-8044-a864-e1da18a7203d')
    expect(
      normalizeNotionId(
        'https://www.notion.so/team/Fix-cafe-3e498940b24a8044a864e1da18a7203d?pvs=4'
      )
    ).toBe('3e498940-b24a-8044-a864-e1da18a7203d')
  })

  it('parses inline discussions with their anchored text', () => {
    const text = JSON.stringify({
      text: '<discussions total-count="1"><discussion id="discussion://p/b/d" comment-count="1" resolved="false" type="comment" context="inline" text-context="ttendu :"><comment id="c" user-url="user://u/virgin@codoc.co" datetime="2026-09-24T09:16:29.733Z">t</comment></discussion></discussions>'
    })
    expect(parseDiscussions(text)).toEqual([
      {
        id: 'discussion://p/b/d',
        context: 'inline',
        textContext: 'ttendu :',
        resolved: false,
        comments: [
          { id: 'c', author: 'virgin@codoc.co', createdAt: '2026-09-24T09:16:29.733Z', body: 't' }
        ]
      }
    ])
  })

  it('turns discussion spans into highlight marks and drops styling spans, even nested', () => {
    const markdown = notionMarkupToMarkdown(
      'Résultat a<span discussion-urls="discussion://p/b/d">tten<span underline="true">du</span> :</span> end'
    )
    expect(markdown).toBe(
      'Résultat a<mark data-discussions="discussion://p/b/d">ttendu :</mark> end'
    )
  })
})
