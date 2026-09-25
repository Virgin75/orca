import { readFile, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { Store } from '../persistence'
import type {
  LanguageServerDefinitionResult,
  LanguageServerDocumentArgs,
  LanguageServerLanguage,
  LanguageServerLocation,
  LanguageServerPosition,
  LanguageServerStatusSnapshot
} from '../../shared/language-server-types'
import { parseWslPath } from '../wsl'
import { authorizeExternalPath, resolveAuthorizedPath } from './filesystem-auth'
import { isDescendantOrEqual } from './filesystem-path-containment'
import { LanguageServerManager } from '../language-servers/language-server-manager'
import { lspLanguageIdFor } from '../language-servers/language-server-launch'
import { createLanguageServerPackageDir } from '../language-servers/language-server-package-dir'
import { detectWorkspaceLanguages } from '../language-servers/language-server-workspace-detection'

const MAX_PREVIEW_LOCATIONS = 10
const MAX_PREVIEW_BYTES = 2_000_000
// Why: definition targets become readable/openable; only grant source files a server can point at.
const SOURCE_EXTENSIONS = new Set([
  '.py',
  '.pyi',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs'
])
const LANGUAGES: readonly LanguageServerLanguage[] = ['python', 'typescript', 'javascript']
// Why: servers see canonical roots (/private/tmp); the renderer matches status by its own spelling.
const requestedRootsByRealRoot = new Map<string, string>()

function toRendererSnapshot(snapshot: LanguageServerStatusSnapshot): LanguageServerStatusSnapshot {
  return {
    servers: snapshot.servers.map((server) => ({
      ...server,
      rootPath: requestedRootsByRealRoot.get(server.rootPath) ?? server.rootPath
    }))
  }
}

async function resolveWorkspaceRoot(store: Store, rootPath: string): Promise<string | null> {
  if (parseWslPath(rootPath)) {
    return null
  }
  const realRoot = await resolveAuthorizedPath(rootPath, store)
  requestedRootsByRealRoot.set(realRoot, rootPath)
  return realRoot
}

type ResolvedDocument = {
  requestedRoot: string
  realRoot: string
  realFile: string
  languageId: string
  language: LanguageServerLanguage
  text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseDocumentArgs(value: unknown): LanguageServerDocumentArgs | null {
  if (!isRecord(value)) {
    return null
  }
  const { rootPath, filePath, language, text } = value
  const knownLanguage = LANGUAGES.find((l) => l === language)
  if (
    typeof rootPath !== 'string' ||
    typeof filePath !== 'string' ||
    typeof text !== 'string' ||
    !knownLanguage
  ) {
    return null
  }
  return { rootPath, filePath, language: knownLanguage, text }
}

function parsePosition(value: unknown): LanguageServerPosition | null {
  if (!isRecord(value) || !isRecord(value.position)) {
    return null
  }
  const { line, character } = value.position
  return typeof line === 'number' && typeof character === 'number' && line >= 0 && character >= 0
    ? { line, character }
    : null
}

async function resolveDocument(
  store: Store,
  args: LanguageServerDocumentArgs
): Promise<ResolvedDocument | string> {
  // Why: a Windows-side server cannot analyze a WSL distro's toolchain; SSH never reaches here.
  const realRoot = await resolveWorkspaceRoot(store, args.rootPath)
  if (!realRoot) {
    return 'WSL workspaces are not supported yet'
  }
  const realFile = await resolveAuthorizedPath(args.filePath, store)
  if (!isDescendantOrEqual(realFile, realRoot)) {
    return 'File is outside the workspace'
  }
  return {
    requestedRoot: args.rootPath,
    realRoot,
    realFile,
    language: args.language,
    languageId: lspLanguageIdFor(realFile, args.language),
    text: args.text
  }
}

async function readPreview(filePath: string): Promise<string | undefined> {
  try {
    const info = await stat(filePath)
    return info.isFile() && info.size <= MAX_PREVIEW_BYTES
      ? await readFile(filePath, 'utf8')
      : undefined
  } catch {
    return undefined
  }
}

async function toLocations(
  document: ResolvedDocument,
  definitions: { filePath: string; range: LanguageServerLocation['range'] }[]
): Promise<LanguageServerLocation[]> {
  const sourceDefinitions = definitions
    .filter((d) => SOURCE_EXTENSIONS.has(extname(d.filePath).toLowerCase()))
    .slice(0, MAX_PREVIEW_LOCATIONS)
  return Promise.all(
    sourceDefinitions.map(async (definition) => {
      const insideRoot = isDescendantOrEqual(definition.filePath, document.realRoot)
      // Why: map canonical paths back to the renderer's spelling (e.g. /tmp vs /private/tmp) so tabs match.
      const filePath = insideRoot
        ? join(document.requestedRoot, relative(document.realRoot, definition.filePath))
        : definition.filePath
      if (!insideRoot) {
        authorizeExternalPath(definition.filePath)
      }
      return {
        filePath,
        range: definition.range,
        insideRoot,
        content: await readPreview(definition.filePath)
      }
    })
  )
}

export function registerLanguageServerHandlers(store: Store): void {
  const manager = new LanguageServerManager({
    nodePath: process.execPath,
    packageDir: createLanguageServerPackageDir({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      searchFrom: [app.getAppPath(), __dirname]
    }),
    env: () => {
      const env = { ...process.env }
      // Why: inspector/loader flags from Orca's own launch must not leak into the servers.
      delete env.NODE_OPTIONS
      return env
    },
    log: (message) => console.warn(message)
  })
  app.once('will-quit', () => {
    void manager.dispose()
  })
  manager.onStatusChange((snapshot) => {
    const rendererSnapshot = toRendererSnapshot(snapshot)
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('languageServers:statusChanged', rendererSnapshot)
      }
    }
  })

  ipcMain.handle('languageServers:getStatus', () => toRendererSnapshot(manager.getStatus()))
  ipcMain.handle('languageServers:restart', () => manager.restartAll())

  // Why: starting at workspace activation (not first file open) hides server startup from the first Cmd+Click.
  ipcMain.handle(
    'languageServers:startWorkspace',
    async (_event, rootPath: unknown): Promise<void> => {
      if (typeof rootPath !== 'string') {
        return
      }
      const realRoot = await resolveWorkspaceRoot(store, rootPath).catch(() => null)
      if (!realRoot) {
        return
      }
      for (const language of await detectWorkspaceLanguages(realRoot)) {
        manager.getSession(realRoot, language)
      }
    }
  )

  ipcMain.handle('languageServers:prepare', async (_event, rawArgs: unknown): Promise<void> => {
    const args = parseDocumentArgs(rawArgs)
    const document = args ? await resolveDocument(store, args).catch(() => null) : null
    if (!document || typeof document === 'string') {
      return
    }
    await manager
      .getSession(document.realRoot, document.language)
      ?.syncDocument(document.realFile, document.languageId, document.text)
      .catch(() => {})
  })

  ipcMain.handle(
    'languageServers:definition',
    async (_event, rawArgs: unknown): Promise<LanguageServerDefinitionResult> => {
      const args = parseDocumentArgs(rawArgs)
      const position = parsePosition(rawArgs)
      if (!args || !position) {
        return { status: 'unavailable', reason: 'Invalid request' }
      }
      try {
        const document = await resolveDocument(store, args)
        if (typeof document === 'string') {
          return { status: 'unavailable', reason: document }
        }
        const session = manager.getSession(document.realRoot, document.language)
        if (!session) {
          return { status: 'unavailable', reason: 'Language server is restarting' }
        }
        await session.syncDocument(document.realFile, document.languageId, document.text)
        const definitions = await session.definition(document.realFile, position)
        return { status: 'ok', locations: await toLocations(document, definitions) }
      } catch (error) {
        return {
          status: 'unavailable',
          reason: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )
}
