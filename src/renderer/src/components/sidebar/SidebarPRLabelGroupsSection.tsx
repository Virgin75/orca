import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { CacheEntry } from '@/store/github/cache-model'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import { normalizePRLabelGroups } from './worktree-list/grouping/pr-label-lanes'

const EMPTY_LABELS: readonly string[] = []

/** Sorted label names across every cached PR, so the picker needs no network call. */
export function collectCachedPRLabels(
  prCache: Readonly<Record<string, CacheEntry<PRInfo> | undefined>>
): string[] {
  const labels = new Set<string>()
  for (const entry of Object.values(prCache)) {
    for (const label of entry?.data?.labels ?? []) {
      if (label) {
        labels.add(label)
      }
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

/** Toggling appends to the end, so selection order is the lane priority. */
export function togglePRLabelGroup(chosen: readonly string[], label: string): string[] {
  return chosen.includes(label) ? chosen.filter((name) => name !== label) : [...chosen, label]
}

export function SidebarPRLabelGroupsSection({
  preserveWorkspaceBoardOpen = false
}: {
  preserveWorkspaceBoardOpen?: boolean
}): React.JSX.Element {
  const storedChosen = useAppStore((s) => s.settings?.prLabelGroups ?? EMPTY_LABELS)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const cachedLabels = useAppStore(useShallow((s) => collectCachedPRLabels(s.prCache)))
  const chosen = useMemo(() => normalizePRLabelGroups(storedChosen), [storedChosen])
  // Why: chosen labels stay listed even when no cached PR carries them right now.
  const available = useMemo(
    () => [...chosen, ...cachedLabels.filter((label) => !chosen.includes(label))],
    [chosen, cachedLabels]
  )
  const setChosen = useCallback(
    (next: string[]) => void updateSettings({ prLabelGroups: next }),
    [updateSettings]
  )
  const summary =
    chosen.length === 0
      ? translate('auto.components.sidebar.SidebarPRLabelGroupsSection.none', 'None')
      : chosen.length === 1
        ? chosen[0]
        : translate(
            'auto.components.sidebar.SidebarPRLabelGroupsSection.count',
            '{{value0}} labels',
            { value0: chosen.length }
          )

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex flex-1 items-center justify-between gap-3">
          <span>
            {translate('auto.components.sidebar.SidebarPRLabelGroupsSection.title', 'Label groups')}
          </span>
          <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
            {summary}
          </span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-60"
        data-workspace-board-preserve-open={preserveWorkspaceBoardOpen ? '' : undefined}
      >
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.sidebar.SidebarPRLabelGroupsSection.hint',
              'First checked label wins'
            )}
          </span>
          <button
            type="button"
            onClick={() => setChosen([])}
            disabled={chosen.length === 0}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {translate('auto.components.sidebar.SidebarPRLabelGroupsSection.clear', 'Clear')}
          </button>
        </div>
        {available.length === 0 ? (
          <div className="px-2 py-2 text-[12px] text-muted-foreground">
            {translate(
              'auto.components.sidebar.SidebarPRLabelGroupsSection.empty',
              'No PR labels found yet'
            )}
          </div>
        ) : (
          available.map((label) => {
            const priority = chosen.indexOf(label)
            return (
              <DropdownMenuCheckboxItem
                key={label}
                checked={priority !== -1}
                onCheckedChange={() => setChosen(togglePRLabelGroup(chosen, label))}
                onSelect={(event) => event.preventDefault()}
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{label}</span>
                  {priority !== -1 ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {priority + 1}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuCheckboxItem>
            )
          })
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
