import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import type { TestEnvironmentRun } from '@/store/test-environment-runs'

export type TestEnvironmentPaneStatus = 'starting' | 'running' | 'stopped'

const POLL_MS = 3_000
// Why: the shell has no child until the typed command starts; don't call that "stopped" yet.
const STARTUP_GRACE_MS = 15_000

/** Per-setup status: a pane whose shell still has children is running its script. */
export function useTestEnvironmentPaneStatus(
  run: TestEnvironmentRun | undefined,
  isVisible: boolean
): Record<string, TestEnvironmentPaneStatus> {
  const layout = useAppStore((s) => (run ? s.terminalLayoutsByTabId[run.tabId] : undefined))
  const [statuses, setStatuses] = useState<Record<string, TestEnvironmentPaneStatus>>({})
  // Keyed by leaf id, which is minted fresh per run, so entries never leak across runs.
  const seenRunning = useRef(new Set<string>())

  useEffect(() => {
    if (!run || !isVisible) {
      return
    }
    let cancelled = false
    const poll = async (): Promise<void> => {
      const next: Record<string, TestEnvironmentPaneStatus> = {}
      const inGrace = Date.now() - run.startedAt < STARTUP_GRACE_MS
      await Promise.all(
        run.panes.map(async (pane) => {
          const ptyId = layout?.ptyIdsByLeafId?.[pane.leafId]
          if (!ptyId) {
            next[pane.leafId] = inGrace ? 'starting' : 'stopped'
            return
          }
          const busy = await window.api.pty.hasChildProcesses(ptyId).catch(() => null)
          if (typeof busy !== 'boolean') {
            // Unknown (host unreachable): keep the last verdict instead of guessing.
            next[pane.leafId] = seenRunning.current.has(pane.leafId) ? 'running' : 'starting'
          } else if (busy) {
            seenRunning.current.add(pane.leafId)
            next[pane.leafId] = 'running'
          } else {
            next[pane.leafId] =
              inGrace && !seenRunning.current.has(pane.leafId) ? 'starting' : 'stopped'
          }
        })
      )
      if (!cancelled) {
        setStatuses(next)
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isVisible, layout, run])

  return statuses
}
