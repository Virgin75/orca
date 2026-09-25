import React, { useState } from 'react'
import { Globe, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { DEFAULT_TEST_ENVIRONMENT_COLOR } from '../../../../shared/test-environments'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import type { TestEnvironment } from '../../../../shared/test-environment-types'
import { TestEnvironmentEditorDialog } from './TestEnvironmentEditorDialog'

function createEmptyTestEnvironment(): TestEnvironment {
  return {
    id: crypto.randomUUID(),
    name: '',
    color: DEFAULT_TEST_ENVIRONMENT_COLOR,
    ports: [],
    repos: [],
    publicUrl: ''
  }
}

export function TestEnvironmentsSettingsPane({
  settings,
  updateSettings,
  repos
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  repos: readonly Repo[]
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const [editing, setEditing] = useState<TestEnvironment | null>(null)
  const environments = settings.testEnvironments ?? []
  const repoNameById = new Map(repos.map((repo) => [repo.id, repo.displayName]))

  const save = (env: TestEnvironment): void => {
    const exists = environments.some((candidate) => candidate.id === env.id)
    void updateSettings({
      testEnvironments: exists
        ? environments.map((candidate) => (candidate.id === env.id ? env : candidate))
        : [...environments, env]
    })
    setEditing(null)
  }

  const remove = async (env: TestEnvironment): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.settings.testEnvironments.deleteTitle',
        'Delete "{{value0}}"?',
        {
          value0: env.name || 'Untitled'
        }
      ),
      description: translate(
        'auto.components.settings.testEnvironments.deleteDescription',
        'Running instances keep their terminals, but you will no longer be able to launch it.'
      ),
      confirmLabel: translate('auto.components.settings.testEnvironments.delete', 'Delete'),
      confirmVariant: 'destructive'
    })
    if (confirmed) {
      void updateSettings({
        testEnvironments: environments.filter((candidate) => candidate.id !== env.id)
      })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(createEmptyTestEnvironment())}
        >
          <Plus />
          {translate('auto.components.settings.testEnvironments.new', 'New test environment')}
        </Button>
      </div>
      {environments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <Globe className="size-5" />
          {translate(
            'auto.components.settings.testEnvironments.empty',
            'No test environments yet. Create one to launch several repositories together from a workspace.'
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {environments.map((env) => {
            const setupCount = env.repos.reduce((total, repo) => total + repo.setups.length, 0)
            return (
              <li key={env.id} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: env.color }}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {env.name ||
                      translate('auto.components.settings.testEnvironments.untitled', 'Untitled')}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {env.repos
                      .map((repo) => repoNameById.get(repo.repoId) ?? repo.repoId)
                      .join(' · ')}
                    {' — '}
                    {translate(
                      'auto.components.settings.testEnvironments.summary',
                      '{{value0}} setups, {{value1}} ports',
                      { value0: setupCount, value1: env.ports.length }
                    )}
                  </span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={translate('auto.components.settings.testEnvironments.edit', 'Edit')}
                  onClick={() => setEditing(env)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={translate(
                    'auto.components.settings.testEnvironments.delete',
                    'Delete'
                  )}
                  onClick={() => void remove(env)}
                >
                  <Trash2 />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {editing ? (
        <TestEnvironmentEditorDialog
          initial={editing}
          repos={repos}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  )
}
