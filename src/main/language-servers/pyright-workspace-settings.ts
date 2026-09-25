import { relative } from 'node:path'
import { detectPythonEnvironments } from './python-environment-detection'

export type LanguageServerWorkspaceSettings = {
  /** Answers one `workspace/configuration` item; null means "server default". */
  settingsFor: (section: string | undefined) => Promise<unknown>
  /** Shown in the status bar, e.g. ".venv" or "none found". */
  environmentLabel: Promise<string | undefined>
}

/**
 * Points Pyright at the workspace's virtualenvs through `extraPaths` rather than `pythonPath`:
 * Pyright executes a `pythonPath` interpreter, and a repo's `.venv/bin/python` is repo-supplied code.
 */
export function createPyrightWorkspaceSettings(rootPath: string): LanguageServerWorkspaceSettings {
  const environments = detectPythonEnvironments(rootPath).catch(() => [])
  const analysis = environments.then((found) => ({
    // Why: sending any `analysis` block turns autoSearchPaths off unless set explicitly.
    autoSearchPaths: true,
    useLibraryCodeForTypes: true,
    diagnosticMode: 'openFilesOnly',
    extraPaths: [...new Set(found.flatMap((env) => env.searchPaths))]
  }))
  return {
    settingsFor: async (section) => {
      if (section === 'python') {
        return { analysis: await analysis }
      }
      if (section === 'python.analysis') {
        return analysis
      }
      return null
    },
    environmentLabel: environments.then((found) =>
      found.length > 0
        ? found.map((env) => relative(rootPath, env.venvDir) || env.venvDir).join(', ')
        : undefined
    )
  }
}
