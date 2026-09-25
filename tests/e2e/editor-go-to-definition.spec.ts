import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  getActiveWorktreeContext,
  type ActiveWorktreeContext
} from './helpers/markdown-editor-fixture'

const FIXTURE_FILES: Record<string, string> = {
  'tsconfig.json':
    '{\n  // alias resolved through compilerOptions.paths\n  "compilerOptions": { "baseUrl": ".", "paths": { "@lib/*": ["lib/*"] } },\n}\n',
  'lib/math.ts':
    '// math helpers\n\nexport function addNumbers(a: number, b: number) {\n  return a + b\n}\n',
  'app.ts': "import { addNumbers } from '@lib/math'\n\nexport const total = addNumbers(1, 2)\n",
  'pkg/__init__.py': '',
  'pkg/geometry.py': 'import math\n\n\nclass Circle:\n    radius = math.pi\n',
  'main.py': 'from pkg.geometry import Circle\n\nshape = Circle()\n'
}

async function openFixtureFile(
  page: Page,
  context: ActiveWorktreeContext,
  filePath: string,
  language: string
): Promise<void> {
  await page.evaluate(
    ({ filePath, relativePath, worktreeId, language }) => {
      window.__store
        ?.getState()
        .openFile({ filePath, relativePath, worktreeId, language, mode: 'edit' })
    },
    {
      filePath,
      relativePath: path.relative(context.rootPath, filePath),
      worktreeId: context.worktreeId,
      language
    }
  )
}

async function modifierClickSymbol(page: Page, lineText: string, symbol: string): Promise<void> {
  const line = page.locator('.monaco-editor .view-line').filter({ hasText: lineText })
  await expect(line).toHaveCount(1, { timeout: 25_000 })
  // Why: Monaco's token spans don't align with identifiers, so measure the substring with a DOM Range.
  const box = await line.evaluate((element, name) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = (node.textContent ?? '').indexOf(name)
      if (index !== -1) {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + name.length)
        const rect = range.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }
    }
    return null
  }, symbol)
  if (!box) {
    throw new Error(`No bounding box for ${symbol}`)
  }
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // Why: Monaco's link gesture needs a modifier-held move before the click, like a real Cmd-hover.
  await page.keyboard.down('ControlOrMeta')
  await page.mouse.move(x, y)
  await page.mouse.move(x + 1, y)
  await page.mouse.down()
  await page.mouse.up()
  await page.keyboard.up('ControlOrMeta')
}

test('starts the workspace language server at launch and shows it in the status bar', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  // Why: the seeded repo has package.json, so TypeScript must be ready before any file is opened.
  const segment = orcaPage.locator('[data-language-server-state]')
  await expect(segment).toHaveAttribute('data-language-server-state', 'ready', { timeout: 45_000 })
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().openFiles.length))
    .toBe(0)
  await segment.click()
  await expect(orcaPage.getByText('TypeScript (TS/JS)')).toBeVisible()
})

test('shows the detected Python virtualenv in the language server menu', async ({ orcaPage }) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const context = await getActiveWorktreeContext(orcaPage)
  const created = ['pyproject.toml', '.venv'].map((name) => path.join(context.rootPath, name))
  try {
    await writeFile(created[0], '[project]\nname = "e2e"\n', 'utf8')
    await mkdir(path.join(created[1], 'lib', 'python3.12', 'site-packages'), { recursive: true })
    await writeFile(path.join(created[1], 'pyvenv.cfg'), 'version = 3.12.0\n', 'utf8')
    const segment = orcaPage.locator('[data-language-server-state]')
    await segment.click()
    await orcaPage.getByText('Restart language servers').click()
    await segment.click()
    await expect(orcaPage.getByText('Virtualenv: .venv')).toBeVisible({ timeout: 45_000 })
  } finally {
    for (const target of created) {
      await rm(target, { recursive: true, force: true }).catch(() => {})
    }
  }
})

test('Cmd/Ctrl+Click jumps to language-server definitions in TypeScript and Python', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const context = await getActiveWorktreeContext(orcaPage)
  const root = path.join(
    context.rootPath,
    `.orca-e2e-go-to-definition-${testInfo.workerIndex}-${Date.now()}`
  )

  try {
    for (const [relative, content] of Object.entries(FIXTURE_FILES)) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
      await writeFile(path.join(root, relative), content, 'utf8')
    }
    const header = orcaPage.locator('.editor-header-path').first()

    await openFixtureFile(orcaPage, context, path.join(root, 'app.ts'), 'typescript')
    await expect(header).toContainText('app.ts', { timeout: 20_000 })
    await modifierClickSymbol(orcaPage, 'export const total', 'addNumbers')
    // Why: the first hop pays a cold tsserver start and project load right after a fresh build.
    await expect(header).toContainText(path.join('lib', 'math.ts').replace(/\\/g, '/'), {
      timeout: 45_000
    })
    await expect(
      orcaPage
        .locator('.monaco-editor .view-line')
        .filter({ hasText: 'export function addNumbers' })
    ).toBeVisible()

    await openFixtureFile(orcaPage, context, path.join(root, 'main.py'), 'python')
    await expect(header).toContainText('main.py', { timeout: 20_000 })
    await modifierClickSymbol(orcaPage, 'shape = Circle()', 'Circle')
    await expect(header).toContainText('geometry.py', { timeout: 45_000 })
    await expect(
      orcaPage.locator('.monaco-editor .view-line').filter({ hasText: 'class Circle:' })
    ).toBeVisible()

    // Library targets (Pyright's bundled typeshed) open read-only as external files.
    await modifierClickSymbol(orcaPage, 'radius = math.pi', 'pi')
    await expect(header).toContainText('__init__.pyi', { timeout: 15_000 })
    await expect(
      orcaPage.locator('.monaco-editor .view-line').filter({ hasText: /^pi:\sFinal/ })
    ).toBeVisible()
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
})
