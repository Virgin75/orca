import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { getLocalLanguageServerRoot } from '../editor/monaco-language-server-client'

/** Starts the active local workspace's language servers as soon as the session is ready. */
export function LanguageServerStartupGate({ enabled }: { enabled: boolean }): null {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeRootPath = useAppStore((s) =>
    s.activeWorktreeId ? (s.getKnownWorktreeById(s.activeWorktreeId)?.path ?? null) : null
  )

  useEffect(() => {
    if (!enabled || !activeWorktreeId || !activeRootPath || isPairedWebClientWindow()) {
      return
    }
    const rootPath = getLocalLanguageServerRoot(activeWorktreeId)
    if (rootPath) {
      void window.api.languageServers.startWorkspace(rootPath).catch(() => {})
    }
  }, [enabled, activeWorktreeId, activeRootPath])

  return null
}
