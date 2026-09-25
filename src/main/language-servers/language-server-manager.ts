import type {
  LanguageServerLanguage,
  LanguageServerStatusEntry,
  LanguageServerStatusSnapshot
} from '../../shared/language-server-types'
import {
  languageServerKindFor,
  resolveLanguageServerLaunch,
  type BundledLanguageServerPackage,
  type LanguageServerKind
} from './language-server-launch'
import { LanguageServerSession } from './language-server-session'
import { createPyrightWorkspaceSettings } from './pyright-workspace-settings'

const IDLE_SHUTDOWN_MS = 15 * 60_000
const IDLE_SWEEP_MS = 60_000
// Why: each server holds a whole project's analysis in memory; bound how many run at once.
const MAX_SESSIONS = 4
const CRASH_WINDOW_MS = 60_000
const MAX_CRASHES_PER_WINDOW = 3
const CRASH_COOLDOWN_MS = 5 * 60_000

export type LanguageServerManagerOptions = {
  nodePath: string
  packageDir: (name: BundledLanguageServerPackage) => string
  env: () => NodeJS.ProcessEnv
  log?: (message: string) => void
}

type CrashRecord = { times: number[]; blockedUntil: number }

function splitKey(key: string): [LanguageServerKind, string] {
  const separator = key.indexOf('\0')
  const kind = key.slice(0, separator) === 'pyright' ? 'pyright' : 'typescript'
  return [kind, key.slice(separator + 1)]
}

/** Starts one server per (kind, workspace root) on demand and retires idle or crashing ones. */
export class LanguageServerManager {
  private readonly sessions = new Map<string, LanguageServerSession>()
  private readonly crashes = new Map<string, CrashRecord>()
  private readonly sweepTimer: ReturnType<typeof setInterval>
  private readonly statusListeners = new Set<(snapshot: LanguageServerStatusSnapshot) => void>()
  private disposed = false

  constructor(private readonly options: LanguageServerManagerOptions) {
    this.sweepTimer = setInterval(() => this.retireIdleSessions(), IDLE_SWEEP_MS)
    this.sweepTimer.unref?.()
  }

  /** Returns null while the server for this root is in crash cooldown. */
  getSession(rootPath: string, language: LanguageServerLanguage): LanguageServerSession | null {
    if (this.disposed) {
      return null
    }
    const kind = languageServerKindFor(language)
    const key = `${kind}\0${rootPath}`
    const existing = this.sessions.get(key)
    if (existing?.isAlive) {
      this.sessions.delete(key)
      this.sessions.set(key, existing)
      return existing
    }
    const crash = this.crashes.get(key)
    if (crash && crash.blockedUntil > Date.now()) {
      return null
    }
    const session = this.startSession(key, kind, rootPath)
    this.sessions.set(key, session)
    this.evictOverflow()
    this.emitStatus()
    return session
  }

  getStatus(): LanguageServerStatusSnapshot {
    const servers: LanguageServerStatusEntry[] = []
    for (const [key, session] of this.sessions) {
      const [kind, rootPath] = splitKey(key)
      servers.push({
        kind,
        rootPath,
        state: session.state,
        message: session.message,
        ...(kind === 'pyright' ? { pythonEnvironment: session.environment ?? null } : {})
      })
    }
    const now = Date.now()
    for (const [key, crash] of this.crashes) {
      if (crash.blockedUntil > now && !this.sessions.has(key)) {
        const [kind, rootPath] = splitKey(key)
        servers.push({ kind, rootPath, state: 'error', message: 'Stopped after repeated crashes' })
      }
    }
    return { servers }
  }

  onStatusChange(listener: (snapshot: LanguageServerStatusSnapshot) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private emitStatus(): void {
    const snapshot = this.getStatus()
    for (const listener of this.statusListeners) {
      listener(snapshot)
    }
  }

  private startSession(
    key: string,
    kind: LanguageServerKind,
    rootPath: string
  ): LanguageServerSession {
    const session: LanguageServerSession = new LanguageServerSession({
      launch: resolveLanguageServerLaunch(kind, this.options.packageDir),
      rootPath,
      nodePath: this.options.nodePath,
      env: this.options.env(),
      log: this.options.log,
      onStateChange: () => this.emitStatus(),
      workspaceSettings: kind === 'pyright' ? createPyrightWorkspaceSettings(rootPath) : undefined,
      onExit: () => {
        if (this.sessions.get(key) === session) {
          this.sessions.delete(key)
          this.recordCrash(key)
        }
        this.emitStatus()
      }
    })
    return session
  }

  private recordCrash(key: string): void {
    const now = Date.now()
    const record = this.crashes.get(key) ?? { times: [], blockedUntil: 0 }
    record.times = [...record.times.filter((t) => now - t < CRASH_WINDOW_MS), now]
    if (record.times.length >= MAX_CRASHES_PER_WINDOW) {
      record.blockedUntil = now + CRASH_COOLDOWN_MS
      record.times = []
      this.options.log?.(`[lsp] ${key.split('\0')[0]} keeps exiting; pausing restarts`)
    }
    this.crashes.set(key, record)
  }

  private evictOverflow(): void {
    while (this.sessions.size > MAX_SESSIONS) {
      const [oldestKey, oldest] = this.sessions.entries().next().value ?? []
      if (!oldestKey || !oldest) {
        return
      }
      this.sessions.delete(oldestKey)
      void oldest.dispose()
      this.emitStatus()
    }
  }

  private retireIdleSessions(): void {
    const now = Date.now()
    for (const [key, session] of this.sessions) {
      if (now - session.lastUsedAt > IDLE_SHUTDOWN_MS) {
        this.sessions.delete(key)
        void session.dispose()
        this.emitStatus()
      }
    }
  }

  /** Stops every server and forgets crash cooldowns so the next request starts fresh. */
  async restartAll(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    this.crashes.clear()
    this.emitStatus()
    await Promise.all(sessions.map((session) => session.dispose()))
  }

  async dispose(): Promise<void> {
    this.disposed = true
    clearInterval(this.sweepTimer)
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    this.statusListeners.clear()
    await Promise.all(sessions.map((session) => session.dispose()))
  }
}
