export type TerminalCommandSplitPane = {
  leafId: string
  command: string
  env?: Record<string, string>
  cwd?: string
}

/**
 * A grid of command panes for a freshly created tab: one row per entry, each
 * row laid out side by side. `rows[0][0]` is the tab's initial pane, which the
 * caller starts through the tab's own pending startup, so it is skipped here.
 */
export type TerminalCommandSplitGrid = {
  rows: TerminalCommandSplitPane[][]
}

// Why: module state instead of a store map — the grid is one-shot mount input and
// needs none of the store's per-tab teardown bookkeeping.
const pendingGrids = new Map<string, TerminalCommandSplitGrid>()

export function queueTerminalCommandSplits(tabId: string, grid: TerminalCommandSplitGrid): void {
  pendingGrids.set(tabId, grid)
}

export function peekTerminalCommandSplits(tabId: string): TerminalCommandSplitGrid | undefined {
  return pendingGrids.get(tabId)
}

export function consumeTerminalCommandSplits(tabId: string, grid: TerminalCommandSplitGrid): void {
  if (pendingGrids.get(tabId) === grid) {
    pendingGrids.delete(tabId)
  }
}
