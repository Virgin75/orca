// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TestEnvironment } from '../../../../shared/test-environment-types'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
      options && name in options ? String(options[name]) : match
    )
}))

import { TestEnvironmentCustomLaunchDialog } from './TestEnvironmentCustomLaunchDialog'

const env: TestEnvironment = {
  id: 'env',
  name: 'Stack',
  color: '#3b82f6',
  ports: [{ id: 'p', name: 'API_PORT' }],
  repos: [
    {
      id: 'entry',
      repoId: 'api',
      setups: [
        {
          id: 'setup',
          name: 'API server',
          env: [{ id: 'v', key: 'DEBUG', value: 'false' }],
          script: 'make run'
        }
      ]
    }
  ],
  publicUrl: 'http://localhost:{{API_PORT}}'
}

const rows = [
  {
    entryId: 'entry',
    repoName: 'api',
    setupNames: ['API server'],
    directories: {
      options: [{ value: '/api-feat', label: 'feat' }],
      defaultValue: '/api-feat',
      unavailableReason: null
    }
  }
]

afterEach(() => cleanup())

describe('TestEnvironmentCustomLaunchDialog', () => {
  it('launches an edited copy and leaves the saved test env untouched', async () => {
    const onLaunch = vi.fn<
      (customEnv: TestEnvironment, selected: Record<string, string>) => Promise<void>
    >(async () => undefined)
    render(
      <TestEnvironmentCustomLaunchDialog
        env={env}
        rows={rows}
        initialDirectoryOverrides={{}}
        onCancel={vi.fn()}
        onLaunch={onLaunch}
      />
    )
    const value = screen.getByLabelText('Value of DEBUG')
    await userEvent.clear(value)
    await userEvent.type(value, 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Launch' }))

    expect(onLaunch).toHaveBeenCalledTimes(1)
    const [customEnv, selected] = onLaunch.mock.calls[0]
    expect(customEnv.repos[0].setups[0].env[0].value).toBe('true')
    expect(selected).toEqual({ entry: '/api-feat' })
    expect(env.repos[0].setups[0].env[0].value).toBe('false')
  })
})
