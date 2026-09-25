import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { TestEnvironmentSetup } from '../../../../shared/test-environment-types'

// Radix Select cannot hold an empty value, so "none" is a sentinel.
const NONE = '__none__'

export type TestEnvironmentSetupOption = { id: string; label: string }

/** Optional start ordering: which setup to wait for, and how this one signals it is ready. */
export function TestEnvironmentSetupDependencyFields({
  value,
  setupOptions,
  portNames,
  onChange
}: {
  value: TestEnvironmentSetup
  /** Every setup of the test env, across repos; this setup is filtered out. */
  setupOptions: readonly TestEnvironmentSetupOption[]
  portNames: readonly string[]
  onChange: (next: TestEnvironmentSetup) => void
}): React.JSX.Element {
  const others = setupOptions.filter((option) => option.id !== value.id)
  const update = (key: 'dependsOn' | 'readyPort', selected: string): void => {
    const next = { ...value }
    if (selected === NONE) {
      delete next[key]
    } else {
      next[key] = selected
    }
    onChange(next)
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {translate('auto.components.settings.testEnvironments.dependsOn', 'Depends on')}
        </span>
        <Select value={value.dependsOn ?? NONE} onValueChange={(next) => update('dependsOn', next)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              {translate('auto.components.settings.testEnvironments.noDependency', 'Nothing')}
            </SelectItem>
            {others.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.testEnvironments.readyPort',
            'Ready when this port is open'
          )}
        </span>
        <Select value={value.readyPort ?? NONE} onValueChange={(next) => update('readyPort', next)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              {translate(
                'auto.components.settings.testEnvironments.readyOnLaunch',
                'As soon as its script starts'
              )}
            </SelectItem>
            {portNames
              .filter((name) => name)
              .map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
