import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyConnectionDeps } from './pty-connection-types'
import type {
  TerminalPaneSetupSplit,
  TerminalPaneIssueCommandSplit
} from './terminal-pane-lifecycle-types'
import { splitPaneWithOneShotStartup } from './terminal-pane-lifecycle-primitives'
import type {
  TerminalCommandSplitGrid,
  TerminalCommandSplitPane
} from '@/lib/terminal-command-split-queue'

/** Lays the grid out as equal rows, each split into equal side-by-side columns. */
function runTerminalCommandSplitGrid(
  manager: PaneManager,
  ptyDeps: PtyConnectionDeps,
  grid: TerminalCommandSplitGrid,
  initialPane: ManagedPane
): void {
  const rows = grid.rows.filter((row) => row.length > 0)
  const split = (
    from: ManagedPane,
    spec: TerminalCommandSplitPane,
    direction: 'vertical' | 'horizontal',
    ratio: number
  ): ManagedPane | null =>
    splitPaneWithOneShotStartup(ptyDeps, { command: spec.command, env: spec.env }, () =>
      manager.splitPane(from.id, direction, { cwd: spec.cwd, leafId: spec.leafId, ratio })
    )
  const rowAnchors: ManagedPane[] = [initialPane]
  for (let r = 1; r < rows.length; r++) {
    // Why: the previous anchor still owns every remaining row, so give it 1/remaining.
    const anchor = split(rowAnchors[r - 1], rows[r][0], 'horizontal', 1 / (rows.length - r + 1))
    if (!anchor) {
      return
    }
    rowAnchors.push(anchor)
  }
  rows.forEach((row, r) => {
    let previous: ManagedPane | null = rowAnchors[r]
    for (let c = 1; c < row.length && previous; c++) {
      previous = split(previous, row[c], 'vertical', 1 / (row.length - c + 1))
    }
  })
}

export function runTerminalPaneBootstrapSplits(args: {
  manager: PaneManager
  ptyDeps: PtyConnectionDeps
  setupSplit: TerminalPaneSetupSplit | null | undefined
  issueCommandSplit: TerminalPaneIssueCommandSplit | null | undefined
  commandSplits?: TerminalCommandSplitGrid | null
  isActive: boolean
}): void {
  const { manager, ptyDeps, setupSplit, issueCommandSplit, commandSplits, isActive } = args
  const initialPane = manager.getActivePane() ?? manager.getPanes()[0]
  // Why: only a fresh one-pane tab owns the grid; a restored layout already has its panes.
  if (commandSplits && initialPane && manager.getPanes().length === 1) {
    runTerminalCommandSplitGrid(manager, ptyDeps, commandSplits, initialPane)
    manager.setActivePane(initialPane.id, { focus: isActive })
  }
  let issueAutomationAnchorPaneId: number | null = null
  if (setupSplit && initialPane) {
    const setupPane = splitPaneWithOneShotStartup(
      ptyDeps,
      { command: setupSplit.command, env: setupSplit.env },
      () => manager.splitPane(initialPane.id, setupSplit.direction)
    )
    issueAutomationAnchorPaneId = setupPane?.id ?? null
    manager.setActivePane(initialPane.id, { focus: isActive })
  }
  if (!issueCommandSplit) {
    return
  }
  let targetPane = manager.getActivePane() ?? manager.getPanes()[0] ?? null
  if (issueAutomationAnchorPaneId !== null) {
    targetPane =
      manager.getPanes().find((pane) => pane.id === issueAutomationAnchorPaneId) ?? targetPane
  }
  if (!targetPane) {
    return
  }
  splitPaneWithOneShotStartup(
    ptyDeps,
    { command: issueCommandSplit.command, env: issueCommandSplit.env },
    () => manager.splitPane(targetPane.id, 'vertical')
  )
  const focusPaneId =
    issueAutomationAnchorPaneId !== null ? (initialPane?.id ?? targetPane.id) : targetPane.id
  manager.setActivePane(focusPaneId, { focus: isActive })
}
