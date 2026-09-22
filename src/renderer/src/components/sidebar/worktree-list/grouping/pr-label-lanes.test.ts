import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/constants'
import { repoMap, worktree } from '../../worktree-list-groups-test-fixtures'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { buildRows } from './build-rows'
import { getPRGroupKeyFromLaneKey, getPRLaneKey } from './group-keys'
import {
  getPRLabelLaneKey,
  getPRLabelLaneKeyForWorktree,
  getPRLabelLaneMeta,
  getPRLabelLaneOrder,
  normalizePRLabelGroups,
  PR_LABEL_NO_PR_LANE_KEY,
  PR_LABEL_OTHER_LANE_KEY,
  resolvePRLabelLaneKey
} from './pr-label-lanes'
import { getGroupKeyForWorktree } from './worktree-group-keys'

function settingsWithLabels(prLabelGroups: string[]): ReturnType<typeof getDefaultSettings> {
  return { ...getDefaultSettings('/tmp'), prLabelGroups }
}

function branchWorktree(id: string, branch: string): Worktree {
  return { ...worktree, id, branch: `refs/heads/${branch}`, displayName: branch }
}

describe('resolvePRLabelLaneKey', () => {
  it('uses the first chosen label the PR carries, not the PR label order', () => {
    expect(resolvePRLabelLaneKey(['bug', 'urgent'], ['urgent', 'bug'])).toBe(
      getPRLabelLaneKey('urgent')
    )
  })

  it('sends PRs without a chosen label to Other and worktrees without a PR to No PR', () => {
    expect(resolvePRLabelLaneKey(['docs'], ['bug'])).toBe(PR_LABEL_OTHER_LANE_KEY)
    expect(resolvePRLabelLaneKey([], ['bug'])).toBe(PR_LABEL_OTHER_LANE_KEY)
    expect(resolvePRLabelLaneKey(null, ['bug'])).toBe(PR_LABEL_NO_PR_LANE_KEY)
  })

  it('keeps a label literally named "other" apart from the Other lane', () => {
    expect(resolvePRLabelLaneKey(['other'], ['other'])).not.toBe(PR_LABEL_OTHER_LANE_KEY)
  })
})

describe('normalizePRLabelGroups', () => {
  it('trims, drops blanks, and de-duplicates while keeping priority order', () => {
    expect(normalizePRLabelGroups([' bug ', '', 'feature', 'bug'])).toEqual(['bug', 'feature'])
    expect(normalizePRLabelGroups(undefined)).toEqual([])
  })
})

describe('getPRLabelLaneMeta', () => {
  it('labels chosen lanes with the label name', () => {
    expect(getPRLabelLaneMeta(getPRLabelLaneKey('needs review')).label).toBe('needs review')
    expect(getPRLabelLaneMeta(PR_LABEL_OTHER_LANE_KEY).label).toBe('Other')
    expect(getPRLabelLaneMeta(PR_LABEL_NO_PR_LANE_KEY).label).toBe('No PR')
  })

  it('orders chosen lanes first, then Other, then No PR', () => {
    expect(getPRLabelLaneOrder(settingsWithLabels(['b', 'a']))).toEqual([
      getPRLabelLaneKey('b'),
      getPRLabelLaneKey('a'),
      PR_LABEL_OTHER_LANE_KEY,
      PR_LABEL_NO_PR_LANE_KEY
    ])
  })
})

describe('getPRLabelLaneKeyForWorktree', () => {
  it('reads labels from the cached PR and ignores a suppressed PR', () => {
    const prCache = {
      'repo-1::feature/super-critical': { data: { number: 7, state: 'open', labels: ['bug'] } }
    }
    const settings = settingsWithLabels(['bug'])
    expect(getPRLabelLaneKeyForWorktree(worktree, repoMap, prCache, settings)).toBe(
      getPRLabelLaneKey('bug')
    )
    expect(
      getPRLabelLaneKeyForWorktree(
        { ...worktree, suppressedGitHubPR: 7 },
        repoMap,
        prCache,
        settings
      )
    ).toBe(PR_LABEL_NO_PR_LANE_KEY)
  })

  it('treats a PR cached before labels were fetched as Other, not No PR', () => {
    const prCache = { 'repo-1::feature/super-critical': { data: { number: 7, state: 'open' } } }
    expect(
      getGroupKeyForWorktree(
        'pr-label',
        worktree,
        repoMap,
        prCache,
        undefined,
        settingsWithLabels(['bug'])
      )
    ).toBe(PR_LABEL_OTHER_LANE_KEY)
  })
})

describe('buildRows in pr-label mode', () => {
  it('renders lanes in priority order and omits empty ones', () => {
    const bugOnly = branchWorktree('wt-bug', 'bug-fix')
    const both = branchWorktree('wt-both', 'both')
    const docs = branchWorktree('wt-docs', 'docs')
    const noPR = branchWorktree('wt-no-pr', 'no-pr')
    const prCache = {
      'repo-1::bug-fix': { data: { number: 1, state: 'open', labels: ['bug'] } },
      'repo-1::both': { data: { number: 2, state: 'open', labels: ['bug', 'urgent'] } },
      'repo-1::docs': { data: { number: 3, state: 'open', labels: ['docs'] } }
    }
    const rows = buildRows(
      'pr-label',
      [bugOnly, both, docs, noPR],
      repoMap,
      prCache,
      new Set(),
      undefined,
      undefined,
      'manual',
      {},
      undefined,
      false,
      settingsWithLabels(['urgent', 'bug', 'feature'])
    )
    const headers = rows.flatMap((row) =>
      row.type === 'header' ? [{ key: row.key, label: row.label, count: row.count }] : []
    )
    expect(headers).toEqual([
      { key: getPRLabelLaneKey('urgent'), label: 'urgent', count: 1 },
      { key: getPRLabelLaneKey('bug'), label: 'bug', count: 1 },
      { key: PR_LABEL_OTHER_LANE_KEY, label: 'Other', count: 1 },
      { key: PR_LABEL_NO_PR_LANE_KEY, label: 'No PR', count: 1 }
    ])
  })
})

describe('getPRGroupKeyFromLaneKey', () => {
  it('inverts getPRLaneKey and falls back to in-progress', () => {
    expect(getPRGroupKeyFromLaneKey(getPRLaneKey('closed'))).toBe('closed')
    expect(getPRGroupKeyFromLaneKey('pr:unknown')).toBe('in-progress')
  })
})
