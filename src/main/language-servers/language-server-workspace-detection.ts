import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LanguageServerLanguage } from '../../shared/language-server-types'

const PYTHON_MARKERS = new Set([
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'Pipfile',
  'pyrightconfig.json',
  'manage.py'
])
const TYPESCRIPT_MARKERS = new Set(['tsconfig.json', 'jsconfig.json', 'package.json'])
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'venv', 'env', '__pycache__', 'dist', 'build'])
// Why: monorepos keep projects one level down (`backend/`, `web/`); cap the scan so huge roots stay cheap.
const MAX_CHILD_DIRECTORIES = 64

async function listEntries(dir: string): Promise<{ files: string[]; dirs: string[] }> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return {
      files: entries.filter((e) => e.isFile()).map((e) => e.name),
      dirs: entries
        .filter(
          (e) => e.isDirectory() && !e.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(e.name)
        )
        .map((e) => e.name)
    }
  } catch {
    return { files: [], dirs: [] }
  }
}

function languagesFromFiles(files: string[]): LanguageServerLanguage[] {
  const languages: LanguageServerLanguage[] = []
  if (files.some((f) => PYTHON_MARKERS.has(f) || f.endsWith('.py'))) {
    languages.push('python')
  }
  if (files.some((f) => TYPESCRIPT_MARKERS.has(f) || /\.[cm]?[jt]sx?$/.test(f))) {
    languages.push('typescript')
  }
  return languages
}

/** Which bundled servers a workspace needs, from project markers in its root and first-level folders. */
export async function detectWorkspaceLanguages(
  rootPath: string
): Promise<LanguageServerLanguage[]> {
  const root = await listEntries(rootPath)
  const found = new Set(languagesFromFiles(root.files))
  if (found.size < 2) {
    const children = await Promise.all(
      root.dirs.slice(0, MAX_CHILD_DIRECTORIES).map((name) => listEntries(join(rootPath, name)))
    )
    for (const child of children) {
      for (const language of languagesFromFiles(child.files)) {
        found.add(language)
      }
    }
  }
  return [...found]
}
