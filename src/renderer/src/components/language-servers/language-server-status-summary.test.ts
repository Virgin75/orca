import { describe, expect, it } from 'vitest'
import { summarizeLanguageServers } from './language-server-status-summary'

const snapshot = {
  servers: [
    { kind: 'pyright' as const, rootPath: '/repo', state: 'ready' as const },
    { kind: 'typescript' as const, rootPath: '/repo', state: 'indexing' as const },
    { kind: 'pyright' as const, rootPath: '/other', state: 'error' as const }
  ]
}

describe('summarizeLanguageServers', () => {
  it('reports the most urgent state of the active workspace only', () => {
    expect(summarizeLanguageServers(snapshot, '/repo', true)).toMatchObject({
      state: 'indexing',
      otherCount: 1
    })
  })

  it('is idle when the active workspace has no servers', () => {
    expect(summarizeLanguageServers(snapshot, '/empty', true).state).toBe('idle')
  })

  it('marks SSH and runtime workspaces as remote', () => {
    expect(summarizeLanguageServers(snapshot, '/remote', false).state).toBe('remote')
  })
})
