import { describe, expect, it } from 'vitest'
import type { RuntimeWorktreeRecord } from '../shared/runtime-types'
import { formatWorktreeShow } from './workspace-format'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the formatter only reads the fields set here.
const worktree = {
  id: 'repo-1::/tmp/wt',
  branch: 'feat/x',
  linkedPR: 12,
  linkedGitLabMR: null
} as unknown as RuntimeWorktreeRecord

describe('formatWorktreeShow', () => {
  it('reports the linked PR, Notion tickets and running test environment', () => {
    const output = formatWorktreeShow({
      worktree,
      notionTickets: [{ id: 'n1', title: 'Fix sync', url: 'https://notion.so/n1' }],
      testEnvironment: {
        envId: 'env-1',
        envName: 'Care stack',
        worktreeId: worktree.id,
        ports: { API_PORT: 4011 },
        publicUrl: 'http://localhost:5173',
        startedAt: 0,
        setups: [{ setupName: 'api', repoName: 'orca-api', cwd: '/tmp/wt/api' }]
      }
    })
    expect(output).toContain('pullRequest: GitHub PR #12')
    expect(output).toContain('notionTickets:\n  - Fix sync (n1) https://notion.so/n1')
    expect(output).toContain(
      [
        'testEnvironment:',
        '  name: Care stack (env-1)',
        '  startedAt: 1970-01-01T00:00:00.000Z',
        '  publicUrl: http://localhost:5173',
        '  ports: API_PORT=4011',
        '  setup: api (orca-api) /tmp/wt/api'
      ].join('\n')
    )
  })

  it('says none when nothing is linked or running', () => {
    const output = formatWorktreeShow({
      worktree: { ...worktree, linkedPR: null },
      notionTickets: [],
      testEnvironment: null
    })
    expect(output).toContain('pullRequest: none')
    expect(output).toContain('notionTickets: none')
    expect(output).toContain('testEnvironment: none')
  })

  it('omits Notion and test env sections for runtimes that do not send them', () => {
    const output = formatWorktreeShow({ worktree })
    expect(output).not.toContain('notionTickets')
    expect(output).not.toContain('testEnvironment')
  })
})
