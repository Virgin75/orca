import { describe, expect, it, vi } from 'vitest'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyConnectionDeps } from './pty-connection-types'
import { runTerminalPaneBootstrapSplits } from './terminal-pane-mount-bootstrap'

type RecordedSplit = {
  from: number
  direction: string
  leafId?: string
  ratio?: number
  command?: string
}

function setup(): { manager: PaneManager; ptyDeps: PtyConnectionDeps; splits: RecordedSplit[] } {
  const panes = [{ id: 1 }]
  const splits: RecordedSplit[] = []
  const deps: { startup?: { command: string } | null } = {}
  const fakeManager = {
    getActivePane: () => panes[0],
    getPanes: () => panes,
    setActivePane: vi.fn(),
    splitPane: (from: number, direction: string, opts?: { leafId?: string; ratio?: number }) => {
      const pane = { id: panes.length + 1 }
      panes.push(pane)
      splits.push({
        from,
        direction,
        leafId: opts?.leafId,
        ratio: opts?.ratio,
        command: deps.startup?.command
      })
      return pane
    }
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the bootstrap only calls the methods faked above.
    manager: fakeManager as unknown as PaneManager,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the bootstrap only reads and writes `startup`.
    ptyDeps: deps as unknown as PtyConnectionDeps,
    splits
  }
}

describe('runTerminalPaneBootstrapSplits command grid', () => {
  it('lays out one row per entry and equal columns within each row', () => {
    const { manager, ptyDeps, splits } = setup()
    const pane = (leafId: string) => ({ leafId, command: `run ${leafId}` })
    runTerminalPaneBootstrapSplits({
      manager,
      ptyDeps,
      setupSplit: null,
      issueCommandSplit: null,
      commandSplits: {
        rows: [
          [pane('a0'), pane('a1'), pane('a2')],
          [pane('b0'), pane('b1')]
        ]
      },
      isActive: false
    })
    expect(splits).toEqual([
      { from: 1, direction: 'horizontal', leafId: 'b0', ratio: 1 / 2, command: 'run b0' },
      { from: 1, direction: 'vertical', leafId: 'a1', ratio: 1 / 3, command: 'run a1' },
      { from: 3, direction: 'vertical', leafId: 'a2', ratio: 1 / 2, command: 'run a2' },
      { from: 2, direction: 'vertical', leafId: 'b1', ratio: 1 / 2, command: 'run b1' }
    ])
  })

  it('leaves a restored multi-pane layout untouched', () => {
    const { manager, ptyDeps, splits } = setup()
    manager.splitPane(1, 'vertical')
    splits.length = 0
    runTerminalPaneBootstrapSplits({
      manager,
      ptyDeps,
      setupSplit: null,
      issueCommandSplit: null,
      commandSplits: {
        rows: [
          [
            { leafId: 'a0', command: 'x' },
            { leafId: 'a1', command: 'y' }
          ]
        ]
      },
      isActive: false
    })
    expect(splits).toEqual([])
  })
})
