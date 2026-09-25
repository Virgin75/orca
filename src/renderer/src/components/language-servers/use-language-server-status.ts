import { useEffect, useState } from 'react'
import type { LanguageServerStatusSnapshot } from '../../../../shared/language-server-types'

const EMPTY_SNAPSHOT: LanguageServerStatusSnapshot = { servers: [] }

export function useLanguageServerStatus(): LanguageServerStatusSnapshot {
  const [snapshot, setSnapshot] = useState<LanguageServerStatusSnapshot>(EMPTY_SNAPSHOT)
  useEffect(() => {
    let mounted = true
    const unsubscribe = window.api.languageServers.onStatusChanged((next) => {
      if (mounted) {
        setSnapshot(next)
      }
    })
    void window.api.languageServers
      .getStatus()
      .then((next) => {
        if (mounted) {
          setSnapshot(next)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])
  return snapshot
}
