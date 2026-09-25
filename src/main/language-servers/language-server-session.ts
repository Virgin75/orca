import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection
} from 'vscode-jsonrpc/node'
import type {
  InitializeParams,
  Location,
  LocationLink,
  DefinitionParams
} from 'vscode-languageserver-protocol'
import { spawnProcess } from '../../shared/child-process/run-process'
import type {
  LanguageServerPosition,
  LanguageServerRange,
  LanguageServerState
} from '../../shared/language-server-types'
import type { LanguageServerLaunch } from './language-server-launch'
import type { LanguageServerWorkspaceSettings } from './pyright-workspace-settings'

const INITIALIZE_TIMEOUT_MS = 60_000
const REQUEST_TIMEOUT_MS = 20_000
const SHUTDOWN_GRACE_MS = 2_000
// Why: every open document costs server memory; close the least recently used past this.
const MAX_OPEN_DOCUMENTS = 64

export type LanguageServerDefinition = { filePath: string; range: LanguageServerRange }

type OpenDocument = { version: number; text: string }

export type LanguageServerSessionOptions = {
  launch: LanguageServerLaunch
  rootPath: string
  /** Electron (as Node) in the app; plain Node in tests. */
  nodePath: string
  env: NodeJS.ProcessEnv
  onExit: () => void
  onStateChange?: () => void
  workspaceSettings?: LanguageServerWorkspaceSettings
  log?: (message: string) => void
}

type ProgressValue = { kind?: string; title?: string; message?: string }

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

function isLocationLink(value: Location | LocationLink): value is LocationLink {
  return 'targetUri' in value
}

function toDefinition(value: Location | LocationLink): LanguageServerDefinition | null {
  const uri = isLocationLink(value) ? value.targetUri : value.uri
  const range = isLocationLink(value) ? value.targetSelectionRange : value.range
  if (!uri.startsWith('file:')) {
    return null
  }
  return { filePath: fileURLToPath(uri), range }
}

/** One language server process for one workspace root, spoken to over stdio JSON-RPC. */
export class LanguageServerSession {
  private readonly child: ReturnType<typeof spawnProcess>
  private readonly connection: MessageConnection
  private readonly ready: Promise<void>
  private readonly documents = new Map<string, OpenDocument>()
  private readonly progress = new Map<string | number, string>()
  private initialized = false
  private exited = false
  private failure: string | undefined
  environment: string | undefined
  lastUsedAt = Date.now()

  constructor(private readonly options: LanguageServerSessionOptions) {
    const { launch, rootPath, nodePath, env } = options
    this.child = spawnProcess({
      program: nodePath,
      args: [launch.scriptPath, ...launch.args],
      cwd: rootPath,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    // Why: servers log heavily to stderr; drain it so a full pipe never blocks the child.
    this.child.stderr.on('data', () => {})
    // Why: a write after the child dies raises EPIPE on stdin; unhandled, it would crash main.
    for (const stream of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      stream.on('error', () => this.handleExit())
    }
    this.child.on('exit', () => this.handleExit())
    this.child.on('error', (error) => {
      options.log?.(`[lsp:${launch.kind}] ${error.message}`)
      this.handleExit()
    })
    this.connection = createMessageConnection(
      new StreamMessageReader(this.child.stdout),
      new StreamMessageWriter(this.child.stdin)
    )
    this.registerServerRequests()
    this.connection.onError(([error]) => options.log?.(`[lsp:${launch.kind}] ${error.message}`))
    this.connection.onClose(() => this.handleExit())
    this.connection.listen()
    void options.workspaceSettings?.environmentLabel.then((label) => {
      this.environment = label
      options.onStateChange?.()
    })
    this.ready = this.initialize().then(
      () => {
        this.initialized = true
        options.onStateChange?.()
      },
      (error: unknown) => {
        this.failure = error instanceof Error ? error.message : String(error)
        options.onStateChange?.()
        throw error
      }
    )
    // Why: callers await `ready`; this keeps an unobserved startup failure from crashing main.
    this.ready.catch(() => {})
  }

  get isAlive(): boolean {
    return !this.exited
  }

  get state(): LanguageServerState {
    if (this.failure) {
      return 'error'
    }
    if (!this.initialized) {
      return 'starting'
    }
    return this.progress.size > 0 ? 'indexing' : 'ready'
  }

  get message(): string | undefined {
    return this.failure ?? [...this.progress.values()].at(-1)
  }

  /** Resolves once `initialize` completes; used to warm servers before any file is opened. */
  whenReady(): Promise<void> {
    return this.ready
  }

  private handleProgress(token: string | number, value: ProgressValue): void {
    if (value.kind === 'begin') {
      this.progress.set(token, value.title ?? value.message ?? '')
    } else if (value.kind === 'report' && this.progress.has(token) && value.message) {
      this.progress.set(token, value.message)
    } else if (value.kind === 'end') {
      this.progress.delete(token)
    } else {
      return
    }
    this.options.onStateChange?.()
  }

  private registerServerRequests(): void {
    // Why: Pyright blocks analysis until `workspace/configuration` answers; nulls mean "defaults".
    this.connection.onRequest(
      'workspace/configuration',
      (params: { items?: { section?: string }[] }) =>
        Promise.all(
          (params.items ?? []).map(
            (item) =>
              this.options.workspaceSettings?.settingsFor(item.section) ?? Promise.resolve(null)
          )
        )
    )
    this.connection.onRequest('client/registerCapability', () => null)
    this.connection.onRequest('client/unregisterCapability', () => null)
    this.connection.onRequest('window/workDoneProgress/create', () => null)
    this.connection.onRequest('workspace/workspaceFolders', () => [
      { uri: pathToFileURL(this.options.rootPath).href, name: 'workspace' }
    ])
    this.connection.onNotification(
      '$/progress',
      (params: { token: string | number; value: ProgressValue }) =>
        this.handleProgress(params.token, params.value ?? {})
    )
    this.connection.onNotification(() => {})
  }

  private async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.options.rootPath).href
    const params: InitializeParams = {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
      initializationOptions: this.options.launch.initializationOptions,
      capabilities: {
        // Why: progress reports are what the status bar shows as "indexing".
        window: { workDoneProgress: true },
        workspace: { configuration: true, workspaceFolders: true },
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: false },
          definition: { dynamicRegistration: false, linkSupport: true }
        }
      }
    }
    await withTimeout(
      this.connection.sendRequest('initialize', params),
      INITIALIZE_TIMEOUT_MS,
      'initialize'
    )
    await this.connection.sendNotification('initialized', {})
  }

  /** Opens or updates the document so the server sees the editor's current (possibly unsaved) text. */
  async syncDocument(filePath: string, languageId: string, text: string): Promise<void> {
    await this.ready
    this.lastUsedAt = Date.now()
    const uri = pathToFileURL(filePath).href
    const existing = this.documents.get(uri)
    this.documents.delete(uri)
    if (!existing) {
      this.documents.set(uri, { version: 1, text })
      await this.connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text }
      })
      await this.closeOverflowDocuments()
      return
    }
    this.documents.set(uri, existing)
    if (existing.text === text) {
      return
    }
    existing.version += 1
    existing.text = text
    await this.connection.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: existing.version },
      contentChanges: [{ text }]
    })
  }

  private async closeOverflowDocuments(): Promise<void> {
    while (this.documents.size > MAX_OPEN_DOCUMENTS) {
      const oldest = this.documents.keys().next().value
      if (oldest === undefined) {
        return
      }
      this.documents.delete(oldest)
      await this.connection.sendNotification('textDocument/didClose', {
        textDocument: { uri: oldest }
      })
    }
  }

  async definition(
    filePath: string,
    position: LanguageServerPosition
  ): Promise<LanguageServerDefinition[]> {
    await this.ready
    this.lastUsedAt = Date.now()
    const params: DefinitionParams = {
      textDocument: { uri: pathToFileURL(filePath).href },
      position
    }
    const result = await withTimeout(
      this.connection.sendRequest<Location | Location[] | LocationLink[] | null>(
        'textDocument/definition',
        params
      ),
      REQUEST_TIMEOUT_MS,
      'textDocument/definition'
    )
    const values = result === null ? [] : Array.isArray(result) ? result : [result]
    return values
      .map(toDefinition)
      .filter((definition): definition is LanguageServerDefinition => definition !== null)
  }

  private handleExit(): void {
    if (this.exited) {
      return
    }
    this.exited = true
    this.connection.dispose()
    this.options.onExit()
  }

  async dispose(): Promise<void> {
    if (this.exited) {
      return
    }
    try {
      await withTimeout(this.connection.sendRequest('shutdown'), SHUTDOWN_GRACE_MS, 'shutdown')
      await this.connection.sendNotification('exit')
    } catch {
      // Unresponsive servers are killed below.
    }
    setTimeout(() => {
      if (!this.exited) {
        this.child.kill()
      }
    }, SHUTDOWN_GRACE_MS).unref()
  }
}
