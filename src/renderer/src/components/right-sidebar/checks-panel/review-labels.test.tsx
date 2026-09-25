import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChecksPanelReviewLabels, toggleReviewLabel } from './review-labels'
import type { ChecksPanelReview } from '../checks-panel-review'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ settings: null, repos: [] })
}))

vi.mock('@/lib/repo-runtime-owner', () => ({
  getSettingsForRepoRuntimeOwner: () => ({ activeRuntimeEnvironmentId: null })
}))

vi.mock('@/hooks/useIssueMetadata', () => ({
  useRepoLabels: () => ({ data: ['bug', 'feature'], loading: false, error: null }),
  useImmediateMutation: () => ({ isPending: () => false, run: vi.fn() })
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

const review: ChecksPanelReview = {
  provider: 'github',
  number: 12,
  title: 'Add labels',
  state: 'open',
  url: 'https://github.com/acme/widgets/pull/12',
  status: 'success',
  updatedAt: '2026-01-01T00:00:00Z',
  mergeable: 'MERGEABLE'
}

function render(labels?: string[]): string {
  return renderToStaticMarkup(
    <ChecksPanelReviewLabels
      review={{ ...review, ...(labels ? { labels } : {}) }}
      repo={{ id: 'repo-1', path: '/repo' }}
      onMutated={() => undefined}
    />
  )
}

describe('ChecksPanelReviewLabels', () => {
  it('shows the PR labels on the pill', () => {
    const html = render(['bug'])
    expect(html).toContain('>bug<')
    expect(html).not.toContain('+ Label')
  })

  it('offers an add affordance when the PR has no labels', () => {
    expect(render()).toContain('+ Label')
  })

  it('lists repository labels with the applied ones checked, plus the GitHub settings link', () => {
    const html = render(['bug'])
    expect(html).toMatch(/border-primary[^>]*>.*?<\/span>bug<\/button>/)
    expect(html).toMatch(/border-input"><\/span>feature<\/button>/)
    expect(html).toContain('Edit labels on GitHub')
  })
})

describe('toggleReviewLabel', () => {
  it('adds a missing label at the end and removes a present one', () => {
    expect(toggleReviewLabel(['bug'], 'feature')).toEqual(['bug', 'feature'])
    expect(toggleReviewLabel(['bug', 'feature'], 'bug')).toEqual(['feature'])
  })
})
