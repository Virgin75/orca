import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { TestEnvironmentRepoDirectories } from '@/lib/test-environment-directories'

export type TestEnvironmentLaunchRepoRow = {
  entryId: string
  repoName: string
  setupNames: string[]
  directories: TestEnvironmentRepoDirectories
}

/** Current picker value per repo entry: the user's choice, else the resolved default. */
export function resolveSelectedDirectories(
  rows: readonly TestEnvironmentLaunchRepoRow[],
  overrides: Record<string, string>
): Record<string, string> {
  const selected: Record<string, string> = {}
  for (const row of rows) {
    const value = overrides[row.entryId] ?? row.directories.defaultValue
    if (value) {
      selected[row.entryId] = value
    }
  }
  return selected
}

/** One worktree picker per test env repo. */
export function TestEnvironmentRepoDirectoryFields({
  rows,
  selected,
  onSelect
}: {
  rows: readonly TestEnvironmentLaunchRepoRow[]
  selected: Record<string, string>
  onSelect: (entryId: string, value: string) => void
}): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.entryId} className="flex flex-col gap-1 text-xs">
          <div className="flex items-baseline gap-1.5">
            <span className="font-medium">{row.repoName}</span>
            <span className="truncate text-muted-foreground">{row.setupNames.join(', ')}</span>
          </div>
          {row.directories.unavailableReason ? (
            <span className="text-muted-foreground">{row.directories.unavailableReason}</span>
          ) : (
            <Select
              value={selected[row.entryId]}
              onValueChange={(value) => onSelect(row.entryId, value)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {row.directories.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </li>
      ))}
    </ul>
  )
}
