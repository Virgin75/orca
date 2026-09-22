import { describe, expect, it } from 'vitest'
import { hostedReviewInfoFromGitHubPRInfo } from '../../../../shared/hosted-review-github'
import { assemblePRRefreshFoundOutcome } from './pr-refresh-outcome-assembly'
import {
  mapRestPullRequest,
  PR_BRANCH_LIST_JSON_FIELDS,
  PR_LOOKUP_JSON_FIELDS,
  pullRequestLabelNames,
  type PullRequestLookupData
} from './pull-request-lookup-data'

const baseData: PullRequestLookupData = {
  number: 12,
  title: 'Add labels',
  state: 'OPEN',
  url: 'https://github.com/acme/widgets/pull/12',
  statusCheckRollup: [],
  updatedAt: '2026-01-01T00:00:00Z',
  mergeable: 'MERGEABLE'
}

function assemble(data: PullRequestLookupData) {
  return assemblePRRefreshFoundOutcome({
    data,
    dataRepo: null,
    dataHeadRepo: null,
    stack: undefined,
    mergeable: 'MERGEABLE',
    stackMergeQueueRequired: undefined,
    confirmedContainedHeadOid: null,
    headDivergedFromMergedPRAtOid: null,
    conflictSummary: undefined
  })
}

describe('PR label lookup', () => {
  it('requests labels from both gh PR lookups', () => {
    expect(PR_LOOKUP_JSON_FIELDS.split(',')).toContain('labels')
    expect(PR_BRANCH_LIST_JSON_FIELDS.split(',')).toContain('labels')
  })

  it('keeps only non-empty string label names', () => {
    expect(
      pullRequestLabelNames({ labels: [{ name: 'bug' }, { name: '' }, { name: 3 }, {}] })
    ).toEqual(['bug'])
    expect(pullRequestLabelNames({})).toBeUndefined()
  })

  it('carries REST labels through the fallback mapping', () => {
    const mapped = mapRestPullRequest({
      number: 12,
      title: 'Add labels',
      state: 'open',
      labels: [{ name: 'feature' }]
    })
    expect(pullRequestLabelNames(mapped)).toEqual(['feature'])
  })

  it('publishes labels on the PR and the hosted review, and omits them when not fetched', () => {
    const outcome = assemble({ ...baseData, labels: [{ name: 'bug' }, { name: 'urgent' }] })
    expect(outcome.kind).toBe('found')
    if (outcome.kind !== 'found') {
      return
    }
    expect(outcome.pr.labels).toEqual(['bug', 'urgent'])
    expect(hostedReviewInfoFromGitHubPRInfo(outcome.pr).labels).toEqual(['bug', 'urgent'])

    const withoutLabels = assemble(baseData)
    expect(withoutLabels.kind === 'found' && 'labels' in withoutLabels.pr).toBe(false)
  })

  it('reports an empty label list when the PR has none', () => {
    const outcome = assemble({ ...baseData, labels: [] })
    expect(outcome.kind === 'found' ? outcome.pr.labels : null).toEqual([])
  })
})
