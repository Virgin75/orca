import { CircleDashed, CircleOff, Tag } from 'lucide-react'
import type React from 'react'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { AppState } from '../../../../store/types'
import { translate } from '@/i18n/i18n'
import { getWorktreeCachedPR } from './group-keys'

const PR_LABEL_LANE_PREFIX = 'pr-label:'
// Why distinct prefixes: a repo label literally named "other" must not share a lane key.
export const PR_LABEL_OTHER_LANE_KEY = 'pr-label-other'
export const PR_LABEL_NO_PR_LANE_KEY = 'pr-label-no-pr'

export function getPRLabelLaneKey(label: string): string {
  return `${PR_LABEL_LANE_PREFIX}${label}`
}

/** Chosen labels, trimmed and de-duplicated, in the user's priority order. */
export function normalizePRLabelGroups(labels: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of labels ?? []) {
    const label = raw.trim()
    if (label && !seen.has(label)) {
      seen.add(label)
      result.push(label)
    }
  }
  return result
}

/** First chosen label the PR carries wins; `null` labels means the worktree has no PR. */
export function resolvePRLabelLaneKey(
  prLabels: readonly string[] | null,
  chosenLabels: readonly string[]
): string {
  if (prLabels === null) {
    return PR_LABEL_NO_PR_LANE_KEY
  }
  const match = chosenLabels.find((label) => prLabels.includes(label))
  return match === undefined ? PR_LABEL_OTHER_LANE_KEY : getPRLabelLaneKey(match)
}

export function getPRLabelLaneKeyForWorktree(
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  prCache: Record<string, unknown> | null,
  settings?: AppState['settings']
): string {
  const pr = getWorktreeCachedPR(worktree, repoMap, prCache, settings)
  return resolvePRLabelLaneKey(
    pr ? (pr.labels ?? []) : null,
    normalizePRLabelGroups(settings?.prLabelGroups)
  )
}

/** Render order: chosen labels, then Other, then No PR. */
export function getPRLabelLaneOrder(settings?: AppState['settings']): string[] {
  return [
    ...normalizePRLabelGroups(settings?.prLabelGroups).map(getPRLabelLaneKey),
    PR_LABEL_OTHER_LANE_KEY,
    PR_LABEL_NO_PR_LANE_KEY
  ]
}

export function getPRLabelLaneMeta(key: string): {
  label: string
  tone: string
  icon: React.ComponentType<{ className?: string }>
} {
  if (key === PR_LABEL_NO_PR_LANE_KEY) {
    return {
      label: translate('auto.components.sidebar.worktree.list.groups.prLabelNoPR', 'No PR'),
      tone: 'text-muted-foreground',
      icon: CircleOff
    }
  }
  if (key === PR_LABEL_OTHER_LANE_KEY) {
    return {
      label: translate('auto.components.sidebar.worktree.list.groups.prLabelOther', 'Other'),
      tone: 'text-muted-foreground',
      icon: CircleDashed
    }
  }
  return {
    label: key.startsWith(PR_LABEL_LANE_PREFIX) ? key.slice(PR_LABEL_LANE_PREFIX.length) : key,
    tone: 'text-foreground',
    icon: Tag
  }
}
