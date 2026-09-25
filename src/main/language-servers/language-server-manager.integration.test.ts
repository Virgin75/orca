import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LanguageServerManager } from './language-server-manager'

const FILES: Record<string, string> = {
  'tsconfig.json':
    '{ "compilerOptions": { "baseUrl": ".", "paths": { "@lib/*": ["lib/*"] }, "strict": true } }',
  'lib/math.ts':
    '// helpers\nexport function addNumbers(a: number, b: number) {\n  return a + b\n}\n',
  'app.ts': "import { addNumbers } from '@lib/math'\nexport const total = addNumbers(1, 2)\n",
  'pkg/__init__.py': '',
  'pkg/geometry.py':
    'import math\n\n\nclass Circle:\n    def area(self) -> float:\n        return math.pi\n',
  'main.py': 'from pkg.geometry import Circle\n\nshape = Circle()\nshape.area()\n'
}

// Why: these spawn the real bundled servers, which take seconds to start on a cold machine.
describe('LanguageServerManager with real servers', { timeout: 90_000 }, () => {
  let root: string
  let manager: LanguageServerManager

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-lsp-')))
    for (const [relative, content] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, relative)), { recursive: true })
      writeFileSync(join(root, relative), content)
    }
    manager = new LanguageServerManager({
      nodePath: process.execPath,
      packageDir: (name) => join(process.cwd(), 'node_modules', name),
      env: () => process.env
    })
  })

  afterAll(async () => {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  })

  it('resolves a TypeScript import through a tsconfig path alias', async () => {
    const filePath = join(root, 'app.ts')
    const session = manager.getSession(root, 'typescript')!
    await session.syncDocument(filePath, 'typescript', FILES['app.ts'])
    const definitions = await session.definition(filePath, { line: 1, character: 22 })
    expect(definitions).toEqual([
      {
        filePath: join(root, 'lib', 'math.ts'),
        range: { start: { line: 1, character: 16 }, end: { line: 1, character: 26 } }
      }
    ])
  })

  it('reports ready status once the server initializes', async () => {
    await manager.getSession(root, 'typescript')!.whenReady()
    expect(manager.getStatus().servers).toContainEqual(
      expect.objectContaining({
        kind: 'typescript',
        rootPath: root,
        state: expect.stringMatching(/ready|indexing/)
      })
    )
  })

  it('sees unsaved edits', async () => {
    const filePath = join(root, 'app.ts')
    const session = manager.getSession(root, 'typescript')!
    const edited = 'function localHelper() {}\nlocalHelper()\n'
    await session.syncDocument(filePath, 'typescript', edited)
    const definitions = await session.definition(filePath, { line: 1, character: 3 })
    expect(definitions.map((d) => [d.filePath, d.range.start.line])).toEqual([[filePath, 0]])
  })

  it('resolves Python package imports and methods with Pyright', async () => {
    const filePath = join(root, 'main.py')
    const session = manager.getSession(root, 'python')!
    await session.syncDocument(filePath, 'python', FILES['main.py'])
    const classDefinition = await session.definition(filePath, { line: 2, character: 10 })
    expect(classDefinition.map((d) => [d.filePath, d.range.start])).toEqual([
      [join(root, 'pkg', 'geometry.py'), { line: 3, character: 6 }]
    ])
    const methodDefinition = await session.definition(filePath, { line: 3, character: 8 })
    expect(methodDefinition.map((d) => [d.filePath, d.range.start])).toEqual([
      [join(root, 'pkg', 'geometry.py'), { line: 4, character: 8 }]
    ])
  })
})
