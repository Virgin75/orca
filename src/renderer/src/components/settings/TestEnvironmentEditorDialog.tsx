import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
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
import type { Repo } from '../../../../shared/repo-types'
import type {
  TestEnvironment,
  TestEnvironmentRepo
} from '../../../../shared/test-environment-types'
import { RepositoryIconColorSection } from './RepositoryIconColorSection'
import { TestEnvironmentRepoEditor } from './TestEnvironmentRepoEditor'

// Code samples, not prose: kept out of the localization catalog.
const PUBLIC_URL_SAMPLE = 'http://localhost:{{APP_PORT}}'
const PORT_NAME_SAMPLE = 'API_PORT'

export function TestEnvironmentEditorDialog({
  initial,
  repos,
  onCancel,
  onSave
}: {
  initial: TestEnvironment
  repos: readonly Repo[]
  onCancel: () => void
  onSave: (env: TestEnvironment) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<TestEnvironment>(initial)
  const [showIssues, setShowIssues] = useState(false)
  const issues = validateTestEnvironment(draft)
  const repoNameById = new Map(repos.map((repo) => [repo.id, repo.displayName]))
  const setupOptions = draft.repos.flatMap((entry) =>
    entry.setups.map((setup) => ({
      id: setup.id,
      label: `${repoNameById.get(entry.repoId) ?? '?'} · ${setup.name || '…'}`
    }))
  )
  const patch = (updates: Partial<TestEnvironment>): void =>
    setDraft((current) => ({ ...current, ...updates }))
  const updateRepo = (next: TestEnvironmentRepo): void =>
    patch({ repos: draft.repos.map((repo) => (repo.id === next.id ? next : repo)) })

  const submit = (): void => {
    if (issues.length > 0) {
      setShowIssues(true)
      return
    }
    onSave({ ...draft, name: draft.name.trim() })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex max-h-[min(90vh,52rem)] w-full max-w-3xl flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.testEnvironments.editorTitle', 'Test environment')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.testEnvironments.editorDescription',
              'Reference a generated port as {{value0}} in env values and the public URL. Setup scripts also see each port as {{value1}}.',
              {
                value0: '{{PORT_NAME}}',
                value1: '$PORT_NAME',
                interpolation: { escapeValue: false }
              }
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek -mx-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-y border-border px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="test-env-name">
              {translate('auto.components.settings.testEnvironments.name', 'Name')}
            </Label>
            <Input
              id="test-env-name"
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>
          <RepositoryIconColorSection
            badgeColor={draft.color}
            onBadgeColorChange={(color) => patch({ color })}
          />

          <section className="flex flex-col gap-2">
            <Label>
              {translate('auto.components.settings.testEnvironments.ports', 'Random ports')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.testEnvironments.portsHint',
                'Each launch picks a free port for every name below.'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.ports.map((port) => (
                <div key={port.id} className="flex items-center gap-1">
                  <Input
                    className="h-8 w-40"
                    value={port.name}
                    placeholder={PORT_NAME_SAMPLE}
                    onChange={(event) =>
                      patch({
                        ports: draft.ports.map((candidate) =>
                          candidate.id === port.id
                            ? { ...candidate, name: event.target.value.toUpperCase() }
                            : candidate
                        )
                      })
                    }
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={translate(
                      'auto.components.settings.testEnvironments.removePort',
                      'Remove port'
                    )}
                    onClick={() =>
                      patch({ ports: draft.ports.filter((candidate) => candidate.id !== port.id) })
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch({ ports: [...draft.ports, { id: crypto.randomUUID(), name: '' }] })
                }
              >
                <Plus />
                {translate('auto.components.settings.testEnvironments.addPort', 'Add port')}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <Label htmlFor="test-env-url">
              {translate('auto.components.settings.testEnvironments.publicUrl', 'Public URL')}
            </Label>
            <Input
              id="test-env-url"
              value={draft.publicUrl}
              placeholder={PUBLIC_URL_SAMPLE}
              onChange={(event) => patch({ publicUrl: event.target.value })}
            />
          </section>

          <section className="flex flex-col gap-3">
            <Label>
              {translate('auto.components.settings.testEnvironments.repositories', 'Repositories')}
            </Label>
            {draft.repos.map((repo) => (
              <TestEnvironmentRepoEditor
                key={repo.id}
                value={repo}
                repos={repos}
                usedRepoIds={draft.repos.map((candidate) => candidate.repoId)}
                setupOptions={setupOptions}
                portNames={draft.ports.map((port) => port.name)}
                onChange={updateRepo}
                onRemove={() =>
                  patch({ repos: draft.repos.filter((candidate) => candidate.id !== repo.id) })
                }
              />
            ))}
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch({
                    repos: [...draft.repos, { id: crypto.randomUUID(), repoId: '', setups: [] }]
                  })
                }
              >
                <Plus />
                {translate('auto.components.settings.testEnvironments.addRepo', 'Add repository')}
              </Button>
            </div>
          </section>

          {showIssues && issues.length > 0 ? (
            <ul className="flex flex-col gap-0.5 text-xs text-destructive">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('auto.components.settings.testEnvironments.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit}>
            {translate('auto.components.settings.testEnvironments.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
