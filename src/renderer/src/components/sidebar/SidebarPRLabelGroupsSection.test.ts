import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: vi.fn() }))

import { collectCachedPRLabels, togglePRLabelGroup } from './SidebarPRLabelGroupsSection'

describe('collectCachedPRLabels', () => {
  it('returns the sorted union of labels across cached PRs', () => {
    const entry = (labels?: string[]) => ({
      fetchedAt: 0,
      data: {
        number: 1,
        title: 't',
        state: 'open' as const,
        url: 'https://github.com/acme/widgets/pull/1',
        checksStatus: 'success' as const,
        updatedAt: '',
        mergeable: 'MERGEABLE' as const,
        ...(labels ? { labels } : {})
      }
    })
    expect(
      collectCachedPRLabels({
        a: entry(['urgent', 'bug']),
        b: entry(['bug', 'docs']),
        c: entry(),
        d: { fetchedAt: 0, data: null },
        e: undefined
      })
    ).toEqual(['bug', 'docs', 'urgent'])
  })
})

describe('togglePRLabelGroup', () => {
  it('appends new labels so selection order is lane priority', () => {
    expect(togglePRLabelGroup(['bug'], 'urgent')).toEqual(['bug', 'urgent'])
    expect(togglePRLabelGroup(['bug', 'urgent'], 'bug')).toEqual(['urgent'])
  })
})
