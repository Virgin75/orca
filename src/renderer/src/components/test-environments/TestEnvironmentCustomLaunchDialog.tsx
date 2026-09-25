import React, { useState } from 'react'
import { LoaderCircle, Play, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { validateTestEnvironment } from '../../../../shared/test-environments'
import type {
  TestEnvironment,
  TestEnvironmentEnvVar,
  TestEnvironmentSetup
} from '../../../../shared/test-environment-types'
import {
  TestEnvironmentRepoDirectoryFields,
  resolveSelectedDirectories,
  type TestEnvironmentLaunchRepoRow
} from './TestEnvironmentRepoDirectoryFields'

/**
 * One-off launch: edits a copy of the test env (env vars, public URL, worktrees)
 * and hands it to the launcher. Settings are never written.
 */
export function TestEnvironmentCustomLaunchDialog({
  env,
  rows,
  initialDirectoryOverrides,
  onCancel,
  onLaunch
}: {
  env: TestEnvironment
  rows: readonly TestEnvironmentLaunchRepoRow[]
  initialDirectoryOverrides: Record<string, string>
  onCancel: () => void
  onLaunch: (customEnv: TestEnvironment, selected: Record<string, string>) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState<TestEnvironment>(() => structuredClone(env))
  const [directoryOverrides, setDirectoryOverrides] = useState(initialDirectoryOverrides)
  const [launching, setLaunching] = useState(false)
  const selected = resolveSelectedDirectories(rows, directoryOverrides)
  const issues = validateTestEnvironment(draft)
  const originalValueById = new Map(
    env.repos.flatMap((repo) =>
      repo.setups.flatMap((setup) => setup.env.map((envVar) => [envVar.id, envVar.value] as const))
    )
  )

  const updateSetup = (
    setupId: string,
    update: (setup: TestEnvironmentSetup) => TestEnvironmentSetup
  ) =>
    setDraft((current) => ({
      ...current,
      repos: current.repos.map((repo) => ({
        ...repo,
        setups: repo.setups.map((setup) => (setup.id === setupId ? update(setup) : setup))
      }))
    }))
  const updateVar = (setupId: string, varId: string, patch: Partial<TestEnvironmentEnvVar>) =>
    updateSetup(setupId, (setup) => ({
      ...setup,
      env: setup.env.map((envVar) => (envVar.id === varId ? { ...envVar, ...patch } : envVar))
    }))

  const launch = async (): Promise<void> => {
    setLaunching(true)
    try {
      await onLaunch(draft, selected)
    } finally {
      setLaunching(false)
    }
  }

  const repoNameByEntryId = new Map(rows.map((row) => [row.entryId, row.repoName]))

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex max-h-[min(90vh,52rem)] w-full max-w-2xl flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.testEnvironments.customLaunchTitle',
              'Launch {{value0}} with custom variables',
              { value0: env.name }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.testEnvironments.customLaunchDescription',
              'Changes apply to this launch only; the test env in Settings stays as it is. Ports can be referenced as {{value0}}.',
              { value0: '{{PORT_NAME}}', interpolation: { escapeValue: false } }
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek -mx-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-y border-border px-6 py-4">
          <section className="flex flex-col gap-2">
            <Label>{translate('auto.components.testEnvironments.worktrees', 'Worktrees')}</Label>
            <TestEnvironmentRepoDirectoryFields
              rows={rows}
              selected={selected}
              onSelect={(entryId, value) =>
                setDirectoryOverrides((current) => ({ ...current, [entryId]: value }))
              }
            />
          </section>

          <section className="flex flex-col gap-1.5">
            <Label htmlFor="test-env-custom-url">
              {translate('auto.components.testEnvironments.publicUrl', 'Public URL')}
            </Label>
            <Input
              id="test-env-custom-url"
              value={draft.publicUrl}
              onChange={(event) => setDraft({ ...draft, publicUrl: event.target.value })}
            />
          </section>

          {draft.repos.map((repo) =>
            repo.setups.map((setup) => (
              <section key={setup.id} className="flex flex-col gap-1.5">
                <Label>
                  {repoNameByEntryId.get(repo.id) ?? repo.repoId} · {setup.name}
                </Label>
                {setup.env.map((envVar) => {
                  const original = originalValueById.get(envVar.id)
                  const isNew = original === undefined
                  return (
                    <div key={envVar.id} className="flex items-center gap-1.5">
                      <Input
                        className="h-8 w-48"
                        value={envVar.key}
                        readOnly={!isNew}
                        aria-label={translate(
                          'auto.components.testEnvironments.envVarName',
                          'Variable name'
                        )}
                        onChange={(event) =>
                          updateVar(setup.id, envVar.id, { key: event.target.value })
                        }
                      />
                      <Input
                        className="h-8 flex-1"
                        value={envVar.value}
                        aria-label={translate(
                          'auto.components.testEnvironments.envVarValue',
                          'Value of {{value0}}',
                          { value0: envVar.key }
                        )}
                        onChange={(event) =>
                          updateVar(setup.id, envVar.id, { value: event.target.value })
                        }
                      />
                      {isNew ? (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={translate(
                            'auto.components.testEnvironments.removeVariable',
                            'Remove variable'
                          )}
                          onClick={() =>
                            updateSetup(setup.id, (current) => ({
                              ...current,
                              env: current.env.filter((item) => item.id !== envVar.id)
                            }))
                          }
                        >
                          <X />
                        </Button>
                      ) : (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={envVar.value === original}
                          aria-label={translate(
                            'auto.components.testEnvironments.resetVariable',
                            'Reset to the saved value'
                          )}
                          onClick={() => updateVar(setup.id, envVar.id, { value: original })}
                        >
                          <RotateCcw />
                        </Button>
                      )}
                    </div>
                  )
                })}
                <div>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      updateSetup(setup.id, (current) => ({
                        ...current,
                        env: [...current.env, { id: crypto.randomUUID(), key: '', value: '' }]
                      }))
                    }
                  >
                    <Plus />
                    {translate('auto.components.testEnvironments.addVariable', 'Add variable')}
                  </Button>
                </div>
              </section>
            ))
          )}

          {issues.length > 0 ? (
            <ul className="flex flex-col gap-0.5 text-xs text-destructive">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('auto.components.testEnvironments.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={issues.length > 0 || launching || Object.keys(selected).length === 0}
            onClick={() => void launch()}
          >
            {launching ? <LoaderCircle className="animate-spin" /> : <Play />}
            {translate('auto.components.testEnvironments.launch', 'Launch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
