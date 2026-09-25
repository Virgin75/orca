import { useAppStore } from '@/store'
import { getConnectionIdForFile } from '@/lib/connection-context'
import { getSettingsForWorktreeRuntimeOwner } from '@/lib/worktree-runtime-owner'
import type {
  LanguageServerDefinitionResult,
  LanguageServerLanguage,
  LanguageServerPosition
} from '../../../../shared/language-server-types'
import type { DefinitionModelOwner } from './monaco-definition-model-owners'

const LANGUAGES: readonly LanguageServerLanguage[] = ['python', 'typescript', 'javascript']

export function toLanguageServerLanguage(languageId: string): LanguageServerLanguage | null {
  return LANGUAGES.find((language) => language === languageId) ?? null
}

/**
 * The workspace root when its language servers can run on this machine. Servers run in Orca's
 * main process, so SSH and paired-runtime workspaces return null until the execution host can
 * run them itself. `filePath` decides ownership in folder workspaces, which resolve per file.
 */
export function getLocalLanguageServerRoot(worktreeId: string, filePath?: string): string | null {
  const state = useAppStore.getState()
  const rootPath = state.getKnownWorktreeById(worktreeId)?.path
  if (!rootPath) {
    return null
  }
  if (getConnectionIdForFile(worktreeId, filePath ?? rootPath) !== null) {
    return null
  }
  const settings = getSettingsForWorktreeRuntimeOwner(state, worktreeId)
  return settings.activeRuntimeEnvironmentId?.trim() ? null : rootPath
}

export function prepareLanguageServer(
  owner: DefinitionModelOwner,
  language: string,
  text: string
): void {
  const lspLanguage = toLanguageServerLanguage(language)
  const rootPath = lspLanguage ? getLocalLanguageServerRoot(owner.worktreeId, owner.filePath) : null
  if (!lspLanguage || !rootPath) {
    return
  }
  void window.api.languageServers
    .prepare({ rootPath, filePath: owner.filePath, language: lspLanguage, text })
    .catch(() => {})
}

export async function requestLanguageServerDefinition(
  owner: DefinitionModelOwner,
  language: LanguageServerLanguage,
  text: string,
  position: LanguageServerPosition
): Promise<LanguageServerDefinitionResult> {
  const rootPath = getLocalLanguageServerRoot(owner.worktreeId, owner.filePath)
  if (!rootPath) {
    return { status: 'unavailable', reason: 'Language servers run only for local workspaces' }
  }
  return window.api.languageServers.definition({
    rootPath,
    filePath: owner.filePath,
    language,
    text,
    position
  })
}
