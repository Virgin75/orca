import { join } from 'node:path'
import type { LanguageServerKind, LanguageServerLanguage } from '../../shared/language-server-types'

export type { LanguageServerKind } from '../../shared/language-server-types'

/** Packages copied to `Resources/language-servers/<name>` in packaged builds. */
export const BUNDLED_LANGUAGE_SERVER_PACKAGES = [
  'pyright',
  'typescript-language-server',
  'typescript-lsp-tsserver'
] as const

export type BundledLanguageServerPackage = (typeof BUNDLED_LANGUAGE_SERVER_PACKAGES)[number]

export type LanguageServerLaunch = {
  kind: LanguageServerKind
  scriptPath: string
  args: string[]
  initializationOptions: Record<string, unknown>
}

export function languageServerKindFor(language: LanguageServerLanguage): LanguageServerKind {
  return language === 'python' ? 'pyright' : 'typescript'
}

export function resolveLanguageServerLaunch(
  kind: LanguageServerKind,
  packageDir: (name: BundledLanguageServerPackage) => string
): LanguageServerLaunch {
  if (kind === 'pyright') {
    return {
      kind,
      scriptPath: join(packageDir('pyright'), 'langserver.index.js'),
      args: ['--stdio'],
      initializationOptions: {}
    }
  }
  return {
    kind,
    scriptPath: join(packageDir('typescript-language-server'), 'lib', 'cli.mjs'),
    args: ['--stdio'],
    initializationOptions: {
      // Why: a workspace's own tsserver.js is repo-supplied code (VS Code asks before running it),
      // and TypeScript 7 native installs ship none; always use the bundled 5.x tsserver.
      tsserver: {
        path: join(packageDir('typescript-lsp-tsserver'), 'lib', 'tsserver.js'),
        // Why: the syntax server answers while the project loads, so early requests miss path
        // aliases and stop at the import; go-to-definition should wait for the real answer.
        useSyntaxServer: 'never'
      },
      disableAutomaticTypingAcquisition: true,
      hostInfo: 'orca'
    }
  }
}

export function lspLanguageIdFor(filePath: string, language: LanguageServerLanguage): string {
  if (language === 'python') {
    return 'python'
  }
  if (/\.[cm]?tsx$/i.test(filePath)) {
    return 'typescriptreact'
  }
  if (/\.jsx$/i.test(filePath)) {
    return 'javascriptreact'
  }
  return language
}
