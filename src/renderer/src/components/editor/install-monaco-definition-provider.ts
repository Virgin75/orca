import type * as Monaco from 'monaco-editor'
import { typescript as monacoTS } from 'monaco-editor'
import { useAppStore } from '@/store'
import type {
  LanguageServerLanguage,
  LanguageServerLocation
} from '../../../../shared/language-server-types'
import {
  getDefinitionModelOwner,
  type DefinitionModelOwner
} from './monaco-definition-model-owners'
import { getDefinitionTargetUri, openDefinitionTarget } from './monaco-definition-navigation'
import {
  requestLanguageServerDefinition,
  toLanguageServerLanguage
} from './monaco-language-server-client'

// Why: Monaco's Cmd-hover preview renders a link's `range`, so give it a few declaration lines.
const PREVIEW_LINES = 6

let installed = false

/** In-file answers from Monaco's TS worker, used where no language server runs (SSH, diffs). */
async function getWorkerDefinitions(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  language: LanguageServerLanguage
): Promise<Monaco.languages.LocationLink[]> {
  if (language === 'python') {
    return []
  }
  try {
    const getWorker =
      language === 'typescript'
        ? await monacoTS.getTypeScriptWorker()
        : await monacoTS.getJavaScriptWorker()
    const worker = await getWorker(model.uri)
    const entries: readonly unknown[] =
      (await worker.getDefinitionAtPosition(model.uri.toString(), model.getOffsetAt(position))) ??
      []
    const links: Monaco.languages.LocationLink[] = []
    for (const entry of entries) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('fileName' in entry) ||
        !('textSpan' in entry)
      ) {
        continue
      }
      const { fileName, textSpan } = entry
      if (fileName !== model.uri.toString() || typeof textSpan !== 'object' || textSpan === null) {
        continue
      }
      const start = 'start' in textSpan && typeof textSpan.start === 'number' ? textSpan.start : 0
      const length =
        'length' in textSpan && typeof textSpan.length === 'number' ? textSpan.length : 0
      const startPos = model.getPositionAt(start)
      const endPos = model.getPositionAt(start + length)
      links.push({
        uri: model.uri,
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column
        }
      })
    }
    return links
  } catch {
    return []
  }
}

function toMonacoRange(location: LanguageServerLocation): Monaco.IRange {
  return {
    startLineNumber: location.range.start.line + 1,
    startColumn: location.range.start.character + 1,
    endLineNumber: location.range.end.line + 1,
    endColumn: location.range.end.character + 1
  }
}

function toLocationLink(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  owner: DefinitionModelOwner,
  location: LanguageServerLocation,
  siblings: LanguageServerLocation[]
): Monaco.languages.LocationLink | null {
  const selection = toMonacoRange(location)
  const worktreeRoot = useAppStore.getState().getKnownWorktreeById(owner.worktreeId)?.path ?? ''
  const uri =
    location.filePath === owner.filePath
      ? model.uri
      : getDefinitionTargetUri(
          monaco,
          {
            worktreeId: owner.worktreeId,
            worktreeRoot,
            filePath: location.filePath,
            insideRoot: location.insideRoot,
            content: location.content
          },
          siblings.filter((s) => s.filePath === location.filePath).map(toMonacoRange)
        )
  if (!uri) {
    return null
  }
  return {
    uri,
    range: {
      startLineNumber: selection.startLineNumber,
      startColumn: 1,
      endLineNumber: selection.startLineNumber + PREVIEW_LINES,
      endColumn: 1
    },
    targetSelectionRange: selection
  }
}

async function provideDefinitions(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  token: Monaco.CancellationToken
): Promise<Monaco.languages.LocationLink[] | null> {
  const language = toLanguageServerLanguage(model.getLanguageId())
  if (!language) {
    return null
  }
  const owner = getDefinitionModelOwner(model.uri.toString())
  const result = owner
    ? await requestLanguageServerDefinition(owner, language, model.getValue(), {
        line: position.lineNumber - 1,
        character: position.column - 1
      })
    : null
  if (token.isCancellationRequested || model.isDisposed()) {
    return null
  }
  if (!owner || !result || result.status !== 'ok') {
    return getWorkerDefinitions(model, position, language)
  }
  return result.locations
    .map((location) => toLocationLink(monaco, model, owner, location, result.locations))
    .filter((link): link is Monaco.languages.LocationLink => link !== null)
}

/** Cmd/Ctrl+Click, F12, and Peek Definition backed by Pyright and typescript-language-server. */
export function installMonacoDefinitionProvider(monaco: typeof Monaco): void {
  if (installed) {
    return
  }
  installed = true
  // Why: the built-in TS provider only sees open models and stops at the import line; its answers
  // would be merged with the language server's into a duplicate Peek on every imported symbol.
  for (const defaults of [monacoTS.typescriptDefaults, monacoTS.javascriptDefaults]) {
    defaults.setModeConfiguration({ ...defaults.modeConfiguration, definitions: false })
  }
  const provider: Monaco.languages.DefinitionProvider = {
    provideDefinition: (model, position, token) =>
      provideDefinitions(monaco, model, position, token)
  }
  for (const language of ['python', 'typescript', 'javascript']) {
    monaco.languages.registerDefinitionProvider(language, provider)
  }
  monaco.editor.registerEditorOpener({
    openCodeEditor: (_source, resource, selectionOrPosition) =>
      openDefinitionTarget(
        resource,
        selectionOrPosition && 'startLineNumber' in selectionOrPosition
          ? {
              lineNumber: selectionOrPosition.startLineNumber,
              column: selectionOrPosition.startColumn
            }
          : selectionOrPosition
      )
  })
}
