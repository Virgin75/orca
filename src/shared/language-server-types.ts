/** Monaco language ids that have a bundled language server. */
export type LanguageServerLanguage = 'python' | 'typescript' | 'javascript'

export type LanguageServerDocumentArgs = {
  rootPath: string
  filePath: string
  language: LanguageServerLanguage
  /** Current editor text, so unsaved edits are what the server analyzes. */
  text: string
}

/** 0-based line and UTF-16 character, as LSP defines positions. */
export type LanguageServerPosition = { line: number; character: number }

export type LanguageServerRange = { start: LanguageServerPosition; end: LanguageServerPosition }

export type LanguageServerDefinitionArgs = LanguageServerDocumentArgs & {
  position: LanguageServerPosition
}

export type LanguageServerLocation = {
  filePath: string
  /** The symbol name's range when the server reports one, else the full definition range. */
  range: LanguageServerRange
  /** Whether the file sits inside `rootPath`; external targets (typeshed, node_modules) open as external files. */
  insideRoot: boolean
  /** File text for Peek and hover previews; omitted when unreadable or too large. */
  content?: string
}

export type LanguageServerDefinitionResult =
  | { status: 'ok'; locations: LanguageServerLocation[] }
  | { status: 'unavailable'; reason: string }

export type LanguageServerKind = 'pyright' | 'typescript'

/** `indexing` = the server reported work-done progress (project load, analysis). */
export type LanguageServerState = 'starting' | 'indexing' | 'ready' | 'error'

export type LanguageServerStatusEntry = {
  kind: LanguageServerKind
  rootPath: string
  state: LanguageServerState
  /** Last failure, or the server's current progress title. */
  message?: string
  /** Pyright only: detected virtualenv folders (null = none found, so dependencies stay unresolved). */
  pythonEnvironment?: string | null
}

export type LanguageServerStatusSnapshot = { servers: LanguageServerStatusEntry[] }
