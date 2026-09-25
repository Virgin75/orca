import type {
  LanguageServerDefinitionArgs,
  LanguageServerDefinitionResult,
  LanguageServerDocumentArgs,
  LanguageServerStatusSnapshot
} from '../../shared/language-server-types'

export type LanguageServersApi = {
  /** Starts the workspace's server and opens the document so the first definition lookup is warm. */
  prepare: (args: LanguageServerDocumentArgs) => Promise<void>
  definition: (args: LanguageServerDefinitionArgs) => Promise<LanguageServerDefinitionResult>
  /** Starts the servers a local workspace needs (detected from project markers). */
  startWorkspace: (rootPath: string) => Promise<void>
  restart: () => Promise<void>
  getStatus: () => Promise<LanguageServerStatusSnapshot>
  onStatusChanged: (callback: (snapshot: LanguageServerStatusSnapshot) => void) => () => void
}
