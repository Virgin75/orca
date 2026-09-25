import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectWorkspaceLanguages } from './language-server-workspace-detection'

const roots: string[] = []

function workspace(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-lsp-detect-'))
  roots.push(root)
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), '')
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('detectWorkspaceLanguages', () => {
  it('detects projects at the root', async () => {
    expect(await detectWorkspaceLanguages(workspace(['pyproject.toml', 'package.json']))).toEqual([
      'python',
      'typescript'
    ])
  })

  it('detects monorepo projects one level down', async () => {
    expect(
      await detectWorkspaceLanguages(
        workspace(['README.md', 'backend/manage.py', 'web/tsconfig.json'])
      )
    ).toEqual(['python', 'typescript'])
  })

  it('ignores dependency folders and plain docs', async () => {
    expect(
      await detectWorkspaceLanguages(
        workspace(['README.md', 'node_modules/x/package.json', '.venv/a.py'])
      )
    ).toEqual([])
  })
})
