import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lspLanguageIdFor, resolveLanguageServerLaunch } from './language-server-launch'
import { createLanguageServerPackageDir } from './language-server-package-dir'

describe('language server launch', () => {
  it('runs packaged servers from Resources/language-servers', () => {
    const packageDir = createLanguageServerPackageDir({
      isPackaged: true,
      resourcesPath: '/app/Resources',
      searchFrom: []
    })
    const launch = resolveLanguageServerLaunch('typescript', packageDir)
    expect(launch.scriptPath).toBe(
      join('/app/Resources', 'language-servers', 'typescript-language-server', 'lib', 'cli.mjs')
    )
    expect(launch.initializationOptions).toMatchObject({
      tsserver: {
        path: join(
          '/app/Resources',
          'language-servers',
          'typescript-lsp-tsserver',
          'lib',
          'tsserver.js'
        ),
        useSyntaxServer: 'never'
      }
    })
    expect(resolveLanguageServerLaunch('pyright', packageDir).scriptPath).toBe(
      join('/app/Resources', 'language-servers', 'pyright', 'langserver.index.js')
    )
  })

  it('finds dev servers in the nearest node_modules above the search roots', () => {
    const packageDir = createLanguageServerPackageDir({
      isPackaged: false,
      resourcesPath: '',
      searchFrom: [join(process.cwd(), 'out', 'main')]
    })
    expect(packageDir('pyright')).toBe(join(process.cwd(), 'node_modules', 'pyright'))
  })

  it('maps file extensions to LSP language ids', () => {
    expect(lspLanguageIdFor('/a/b.tsx', 'typescript')).toBe('typescriptreact')
    expect(lspLanguageIdFor('/a/b.jsx', 'javascript')).toBe('javascriptreact')
    expect(lspLanguageIdFor('/a/b.mjs', 'javascript')).toBe('javascript')
    expect(lspLanguageIdFor('/a/b.py', 'python')).toBe('python')
  })
})
