import React from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../shared/repo-types'
import type {
  TestEnvironmentRepo,
  TestEnvironmentSetup
} from '../../../../shared/test-environment-types'

import {
  TestEnvironmentSetupDependencyFields,
  type TestEnvironmentSetupOption
} from './TestEnvironmentSetupDependencyFields'

// Code samples, not prose: kept out of the localization catalog.
const ENV_KEY_SAMPLE = 'DATABASE_URL'
const ENV_VALUE_SAMPLE = 'http://localhost:{{API_PORT}}'
const SCRIPT_SAMPLE = 'pnpm install\npnpm dev --port $APP_PORT'

export function TestEnvironmentRepoEditor({
  value,
  repos,
  usedRepoIds,
  setupOptions,
  portNames,
  onChange,
  onRemove
}: {
  value: TestEnvironmentRepo
  repos: readonly Repo[]
  usedRepoIds: readonly string[]
  setupOptions: readonly TestEnvironmentSetupOption[]
  portNames: readonly string[]
  onChange: (next: TestEnvironmentRepo) => void
  onRemove: () => void
}): React.JSX.Element {
  const updateSetup = (next: TestEnvironmentSetup): void =>
    onChange({
      ...value,
      setups: value.setups.map((setup) => (setup.id === next.id ? next : setup))
    })
  const selectable = repos.filter(
    (repo) => repo.id === value.repoId || !usedRepoIds.includes(repo.id)
  )

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Select value={value.repoId} onValueChange={(repoId) => onChange({ ...value, repoId })}>
          <SelectTrigger size="sm" className="w-64">
            <SelectValue
              placeholder={translate(
                'auto.components.settings.testEnvironments.pickRepo',
                'Pick a repository'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {selectable.map((repo) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={translate(
              'auto.components.settings.testEnvironments.removeRepo',
              'Remove repository'
            )}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {value.setups.map((setup) => (
        <SetupEditor
          key={setup.id}
          value={setup}
          setupOptions={setupOptions}
          portNames={portNames}
          onChange={updateSetup}
          onRemove={() =>
            onChange({ ...value, setups: value.setups.filter((item) => item.id !== setup.id) })
          }
        />
      ))}
      <div>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              setups: [...value.setups, { id: crypto.randomUUID(), name: '', env: [], script: '' }]
            })
          }
        >
          <Plus />
          {translate('auto.components.settings.testEnvironments.addSetup', 'Add setup')}
        </Button>
      </div>
    </div>
  )
}

function SetupEditor({
  value,
  setupOptions,
  portNames,
  onChange,
  onRemove
}: {
  value: TestEnvironmentSetup
  setupOptions: readonly TestEnvironmentSetupOption[]
  portNames: readonly string[]
  onChange: (next: TestEnvironmentSetup) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2.5">
      <div className="flex items-center gap-2">
        <Input
          className="h-8"
          value={value.name}
          placeholder={translate(
            'auto.components.settings.testEnvironments.setupName',
            'Setup name (e.g. API server, Celery worker)'
          )}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={translate(
            'auto.components.settings.testEnvironments.removeSetup',
            'Remove setup'
          )}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>

      <TestEnvironmentSetupDependencyFields
        value={value}
        setupOptions={setupOptions}
        portNames={portNames}
        onChange={onChange}
      />

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {translate('auto.components.settings.testEnvironments.envVars', 'Environment variables')}
        </span>
        {value.env.map((envVar) => (
          <div key={envVar.id} className="flex items-center gap-1.5">
            <Input
              className="h-8 w-48"
              value={envVar.key}
              placeholder={ENV_KEY_SAMPLE}
              onChange={(event) =>
                onChange({
                  ...value,
                  env: value.env.map((item) =>
                    item.id === envVar.id ? { ...item, key: event.target.value } : item
                  )
                })
              }
            />
            <Input
              className="h-8 flex-1"
              value={envVar.value}
              placeholder={ENV_VALUE_SAMPLE}
              onChange={(event) =>
                onChange({
                  ...value,
                  env: value.env.map((item) =>
                    item.id === envVar.id ? { ...item, value: event.target.value } : item
                  )
                })
              }
            />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={translate(
                'auto.components.settings.testEnvironments.removeEnvVar',
                'Remove variable'
              )}
              onClick={() =>
                onChange({ ...value, env: value.env.filter((item) => item.id !== envVar.id) })
              }
            >
              <X />
            </Button>
          </div>
        ))}
        <div>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              onChange({
                ...value,
                env: [...value.env, { id: crypto.randomUUID(), key: '', value: '' }]
              })
            }
          >
            <Plus />
            {translate('auto.components.settings.testEnvironments.addEnvVar', 'Add variable')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.testEnvironments.script',
            'Setup script (bash, runs after the variables are exported)'
          )}
        </span>
        <Textarea
          className="min-h-24"
          value={value.script}
          spellCheck={false}
          placeholder={SCRIPT_SAMPLE}
          onChange={(event) => onChange({ ...value, script: event.target.value })}
        />
      </div>
    </div>
  )
}
