import { useEffect, useRef, useState } from 'react'

// Why: returning to the window after a short glance shouldn't spend another request.
const FOCUS_REFRESH_MIN_GAP_MS = 30_000

/**
 * Counter that bumps every `intervalMs` while `enabled` and the window is visible, and
 * again when the window regains focus. Header hooks put it in their fetch keys so the
 * active workspace's PR and ticket data stay fresh without polling background ones.
 */
export function useHeaderRefreshTick(enabled: boolean, intervalMs: number): number {
  const [tick, setTick] = useState(0)
  const lastTickAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      return
    }
    // Why: data was just loaded on mount/enable; don't refetch on an immediate focus.
    lastTickAtRef.current = Date.now()
    const bump = (): void => {
      lastTickAtRef.current = Date.now()
      setTick((value) => value + 1)
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        bump()
      }
    }, intervalMs)
    const onFocus = (): void => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastTickAtRef.current >= FOCUS_REFRESH_MIN_GAP_MS
      ) {
        bump()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [enabled, intervalMs])

  return tick
}
