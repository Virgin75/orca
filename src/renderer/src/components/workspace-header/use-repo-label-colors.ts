import { useEffect, useState } from 'react'

// Why: label colors rarely change; one `gh api …/labels` per repo per window is plenty.
const COLORS_TTL_MS = 10 * 60_000
const cache = new Map<string, { colors: Record<string, string>; fetchedAt: number }>()
const inFlight = new Map<string, Promise<Record<string, string>>>()
const EMPTY: Record<string, string> = {}

function loadColors(repo: { id: string; path: string }): Promise<Record<string, string>> {
  const pending = inFlight.get(repo.id)
  if (pending) {
    return pending
  }
  const request = window.api.gh
    .listLabelColors({ repoPath: repo.path, repoId: repo.id })
    .catch(() => ({}))
    .then((colors) => {
      cache.set(repo.id, { colors, fetchedAt: Date.now() })
      return colors
    })
    .finally(() => inFlight.delete(repo.id))
  inFlight.set(repo.id, request)
  return request
}

/** GitHub label name → hex color (no `#`) for the header's colored label badges. */
export function useRepoLabelColors(
  repo: { id: string; path: string } | null,
  enabled: boolean,
  refreshTick: number
): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>(
    () => (repo ? cache.get(repo.id)?.colors : undefined) ?? EMPTY
  )

  useEffect(() => {
    if (!repo || !enabled) {
      return
    }
    const cached = cache.get(repo.id)
    if (cached) {
      setColors(cached.colors)
      if (Date.now() - cached.fetchedAt < COLORS_TTL_MS) {
        return
      }
    }
    let cancelled = false
    void loadColors(repo).then((next) => {
      if (!cancelled) {
        setColors(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [enabled, refreshTick, repo])

  return colors
}
