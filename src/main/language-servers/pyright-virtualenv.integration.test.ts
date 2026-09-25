import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { LanguageServerManager } from './language-server-manager'

const SITE_PACKAGES = '.venv/lib/python3.12/site-packages'
const MAIN =
  'from vendorlib import make_store\nfrom mylib import helper\n\nstore = make_store() or []\nstore.count()\nhelper()\n'

function createWorkspace(withVenv: boolean): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-pyright-venv-')))
  const files: Record<string, string> = { 'main.py': MAIN }
  if (withVenv) {
    files['.venv/pyvenv.cfg'] = 'home = /usr/bin\nversion = 3.12.0\n'
    files[`${SITE_PACKAGES}/vendorlib/__init__.py`] =
      'class Store:\n    def count(self) -> int:\n        return 0\n\n\ndef make_store():\n    return Store()\n'
    // Editable install: the package source lives outside site-packages.
    files['packages/mylib/src/mylib/__init__.py'] = 'def helper() -> None:\n    pass\n'
    files[`${SITE_PACKAGES}/__editable__.mylib.pth`] = `${join(root, 'packages/mylib/src')}\n`
  }
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, relative)), { recursive: true })
    writeFileSync(join(root, relative), content)
  }
  return root
}

describe('Pyright with workspace virtualenvs', { timeout: 90_000 }, () => {
  const manager = new LanguageServerManager({
    nodePath: process.execPath,
    packageDir: (name) => join(process.cwd(), 'node_modules', name),
    env: () => process.env
  })
  const roots: string[] = []

  afterAll(async () => {
    await manager.dispose()
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  async function definitionsAt(root: string, line: number, character: number) {
    const session = manager.getSession(root, 'python')!
    await session.syncDocument(join(root, 'main.py'), 'python', MAIN)
    return session.definition(join(root, 'main.py'), { line, character })
  }

  it('without the venv, an unresolved dependency leaves only the built-in list.count', async () => {
    const root = createWorkspace(false)
    roots.push(root)
    const definitions = await definitionsAt(root, 4, 7)
    expect(definitions.map((d) => d.filePath)).toEqual([expect.stringMatching(/builtins\.pyi$/)])
  })

  it('with the venv, resolves the dependency class and editable installs', async () => {
    const root = createWorkspace(true)
    roots.push(root)
    const definitions = await definitionsAt(root, 4, 7)
    expect(definitions.map((d) => d.filePath)).toContain(
      join(root, SITE_PACKAGES, 'vendorlib', '__init__.py')
    )
    const editable = await definitionsAt(root, 5, 2)
    expect(editable.map((d) => d.filePath)).toEqual([
      join(root, 'packages/mylib/src/mylib/__init__.py')
    ])
    expect(manager.getStatus().servers).toContainEqual(
      expect.objectContaining({ rootPath: root, pythonEnvironment: '.venv' })
    )
  })
})
