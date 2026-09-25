import type * as Monaco from 'monaco-editor'
import { detectLanguage } from '@/lib/language-detect'
import { getRelativePathInsideRoot, normalizeRelativePath } from '@/lib/path'
import { useAppStore } from '@/store'
import { toEditorModelUri } from './editor-model-uri'

const PREVIEW_SCHEME = 'orca-definition'
const MAX_PREVIEW_MODELS = 16

export type DefinitionDestination = {
  worktreeId: string
  worktreeRoot: string
  filePath: string
  /** False for library files (typeshed, node_modules), which open read-only as external files. */
  insideRoot: boolean
  content?: string
}

type NavigationTarget = DefinitionDestination & { selections: Monaco.IRange[] }

// Why: Peek and the Cmd-hover preview need a Monaco model for the target. Creating one at the real
// file URI would be adopted by the file's own editor tab later, so previews use their own scheme.
const previewModels = new Map<string, Monaco.editor.ITextModel>()
const navigationTargets = new Map<string, NavigationTarget>()
let revealFrame: number | null = null

function rememberNavigationTarget(uri: string, target: NavigationTarget): void {
  navigationTargets.delete(uri)
  navigationTargets.set(uri, target)
  // Why: bounded so a long session of hovers cannot grow the map without limit.
  while (navigationTargets.size > MAX_PREVIEW_MODELS * 4) {
    const oldest = navigationTargets.keys().next().value
    if (oldest === undefined) {
      break
    }
    navigationTargets.delete(oldest)
  }
}

function upsertPreviewModel(
  monaco: typeof Monaco,
  uri: Monaco.Uri,
  content: string,
  filePath: string
): void {
  const key = uri.toString()
  const existing = previewModels.get(key)
  previewModels.delete(key)
  if (existing && !existing.isDisposed()) {
    if (existing.getValue() !== content) {
      existing.setValue(content)
    }
    previewModels.set(key, existing)
    return
  }
  previewModels.set(key, monaco.editor.createModel(content, detectLanguage(filePath), uri))
  while (previewModels.size > MAX_PREVIEW_MODELS) {
    const [oldestKey, oldestModel] = previewModels.entries().next().value ?? []
    if (!oldestKey || !oldestModel) {
      break
    }
    previewModels.delete(oldestKey)
    oldestModel.dispose()
  }
}

/** The URI Monaco shows for a definition in another file; null when there is nothing to preview. */
export function getDefinitionTargetUri(
  monaco: typeof Monaco,
  destination: DefinitionDestination,
  selections: Monaco.IRange[]
): Monaco.Uri | null {
  const realUri = monaco.Uri.parse(toEditorModelUri(destination.filePath))
  const target: NavigationTarget = { ...destination, selections }
  const openModel = monaco.editor.getModel(realUri)
  if (openModel && !openModel.isDisposed()) {
    rememberNavigationTarget(realUri.toString(), target)
    return realUri
  }
  if (destination.content === undefined) {
    return null
  }
  const previewUri = realUri.with({ scheme: PREVIEW_SCHEME, query: destination.worktreeId })
  upsertPreviewModel(monaco, previewUri, destination.content, destination.filePath)
  rememberNavigationTarget(previewUri.toString(), target)
  return previewUri
}

/** Opens a definition in Orca's editor; returns false for URIs this module did not hand out. */
export function openDefinitionTarget(
  resource: Monaco.Uri,
  position: { lineNumber: number; column: number } | undefined
): boolean {
  const target = navigationTargets.get(resource.toString())
  if (!target) {
    return false
  }
  const line = position?.lineNumber ?? 1
  const column = position?.column ?? 1
  const selection = target.selections.find(
    (s) => s.startLineNumber === line && s.startColumn === column
  )
  const matchLength =
    selection && selection.endLineNumber === line ? selection.endColumn - selection.startColumn : 0
  const relativePath = target.insideRoot
    ? getRelativePathInsideRoot(target.filePath, target.worktreeRoot)
    : null
  const store = useAppStore.getState()
  store.openFile(
    relativePath === null
      ? {
          filePath: target.filePath,
          // Why: relativePath === filePath is the external-file contract (read the exact path).
          relativePath: target.filePath,
          worktreeId: target.worktreeId,
          runtimeEnvironmentId: null,
          language: detectLanguage(target.filePath),
          mode: 'edit',
          readOnly: true
        }
      : {
          filePath: target.filePath,
          relativePath: normalizeRelativePath(relativePath),
          worktreeId: target.worktreeId,
          runtimeEnvironmentId: null,
          language: detectLanguage(target.filePath),
          mode: 'edit'
        },
    { suppressActiveRuntimeFallback: true }
  )
  if (revealFrame !== null) {
    cancelAnimationFrame(revealFrame)
  }
  store.setPendingEditorReveal(null)
  // Why: opening can replace the active tab and mount Monaco asynchronously; matching search-result
  // navigation, wait two frames so the destination editor owns layout before revealing.
  revealFrame = requestAnimationFrame(() => {
    revealFrame = requestAnimationFrame(() => {
      revealFrame = null
      useAppStore
        .getState()
        .setPendingEditorReveal({ filePath: target.filePath, line, column, matchLength })
    })
  })
  return true
}
