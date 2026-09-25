import React, { useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle, Play, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  directoryChoiceFromValue,
  type TestEnvironmentDirectoryChoice
} from '@/lib/test-environment-directories'
import { validateTestEnvironment } from '../../../../shared/test-environments'
import type { TestEnvironment } from '../../../../shared/test-environment-types'
import {
  TestEnvironmentRepoDirectoryFields,
  resolveSelectedDirectories,
  type TestEnvironmentLaunchRepoRow
} from './TestEnvironmentRepoDirectoryFields'
import { TestEnvironmentCustomLaunchDialog } from './TestEnvironmentCustomLaunchDialog'

export type { TestEnvironmentLaunchRepoRow } from './TestEnvironmentRepoDirectoryFields'

function toChoices(
  selected: Record<string, string>
): Record<string, TestEnvironmentDirectoryChoice> {
  return Object.fromEntries(
    Object.entries(selected).map(([entryId, value]) => [entryId, directoryChoiceFromValue(value)])
  )
}

export function TestEnvironmentLaunchCard({
  env,
  rows,
  onLaunch
}: {
  env: TestEnvironment
  rows: TestEnvironmentLaunchRepoRow[]
  /** `customEnv` is a one-off edited copy; it is never saved to Settings. */
  onLaunch: (
    directories: Record<string, TestEnvironmentDirectoryChoice>,
    customEnv?: TestEnvironment
  ) => Promise<boolean>
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [launching, setLaunching] = useState(false)
  const issue = validateTestEnvironment(env)[0]
  const selected = resolveSelectedDirectories(rows, overrides)
  const runnable = rows.some((row) => selected[row.entryId])
  const disabled = Boolean(issue) || !runnable || launching

  const launch = async (): Promise<void> => {
    setLaunching(true)
    try {
      await onLaunch(toChoices(selected))
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
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left"
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
        <ButtonGroup>
          <Button size="xs" disabled={disabled} onClick={() => void launch()}>
            {launching ? <LoaderCircle className="animate-spin" /> : <Play />}
            {translate('auto.components.testEnvironments.launch', 'Launch')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-xs"
                disabled={disabled}
                aria-label={translate(
                  'auto.components.testEnvironments.moreLaunchOptions',
                  'More launch options'
                )}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setCustomizing(true)}>
                <SlidersHorizontal />
                {translate(
                  'auto.components.testEnvironments.launchWithCustomEnv',
                  'Launch with custom env variables…'
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>
      {expanded ? (
        <div className="border-t border-border p-2.5">
          <TestEnvironmentRepoDirectoryFields
            rows={rows}
            selected={selected}
            onSelect={(entryId, value) =>
              setOverrides((current) => ({ ...current, [entryId]: value }))
            }
          />
        </div>
      ) : null}
      {issue ? <p className="px-2.5 pb-2 text-xs text-destructive">{issue.message}</p> : null}
      {customizing ? (
        <TestEnvironmentCustomLaunchDialog
          env={env}
          rows={rows}
          initialDirectoryOverrides={overrides}
          onCancel={() => setCustomizing(false)}
          onLaunch={async (customEnv, customSelected) => {
            if (await onLaunch(toChoices(customSelected), customEnv)) {
              setCustomizing(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}
