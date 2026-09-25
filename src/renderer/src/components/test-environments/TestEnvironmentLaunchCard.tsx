import React, { useState } from 'react'
import { ChevronRight, LoaderCircle, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  directoryChoiceFromValue,
  type TestEnvironmentDirectoryChoice,
  type TestEnvironmentRepoDirectories
} from '@/lib/test-environment-directories'
import { validateTestEnvironment } from '../../../../shared/test-environments'
import type { TestEnvironment } from '../../../../shared/test-environment-types'

export type TestEnvironmentLaunchRepoRow = {
  entryId: string
  repoName: string
  setupNames: string[]
  directories: TestEnvironmentRepoDirectories
}

export function TestEnvironmentLaunchCard({
  env,
  rows,
  onLaunch
}: {
  env: TestEnvironment
  rows: TestEnvironmentLaunchRepoRow[]
  onLaunch: (directories: Record<string, TestEnvironmentDirectoryChoice>) => Promise<void>
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [launching, setLaunching] = useState(false)
  const issue = validateTestEnvironment(env)[0]
  const selected: Record<string, string> = {}
  for (const row of rows) {
    const value = overrides[row.entryId] ?? row.directories.defaultValue
    if (value) {
      selected[row.entryId] = value
    }
  }
  const runnable = rows.some((row) => selected[row.entryId])

  const launch = async (): Promise<void> => {
    setLaunching(true)
    try {
      await onLaunch(
        Object.fromEntries(
          Object.entries(selected).map(([entryId, value]) => [
            entryId,
            directoryChoiceFromValue(value)
          ])
        )
      )
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="flex flex-col rounded-md border border-border">
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-accent"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: env.color }} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{env.name}</span>
        </button>
        <Button
          size="xs"
          disabled={Boolean(issue) || !runnable || launching}
          onClick={() => void launch()}
        >
          {launching ? <LoaderCircle className="animate-spin" /> : <Play />}
          {translate('auto.components.testEnvironments.launch', 'Launch')}
        </Button>
      </div>
      {expanded ? (
        <ul className="flex flex-col gap-2 border-t border-border p-2.5">
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
                  onValueChange={(value) =>
                    setOverrides((current) => ({
                      ...current,
                      [row.entryId]: value
                    }))
                  }
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
      ) : null}
      {issue ? <p className="px-2.5 pb-2 text-xs text-destructive">{issue.message}</p> : null}
    </div>
  )
}
