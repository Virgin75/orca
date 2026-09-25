import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

export type PythonEnvironment = {
  venvDir: string
  /** `site-packages` plus the folders its `.pth` files add (editable installs, `uv`/`poetry -e .`). */
  searchPaths: string[]
}

const VENV_NAMES = ['.venv', 'venv', 'env', '.virtualenv']
const SKIPPED_DIRECTORIES = new Set(['node_modules', '__pycache__', 'dist', 'build'])
const MAX_CHILD_DIRECTORIES = 64
const MAX_PTH_BYTES = 64 * 1024
const MAX_PTH_PATHS = 100

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function childDirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && !SKIPPED_DIRECTORIES.has(e.name) && !e.name.startsWith('.'))
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

/** POSIX venvs use `lib/pythonX.Y/site-packages`; Windows venvs use `Lib/site-packages`. */
async function findSitePackages(venvDir: string): Promise<string[]> {
  const found: string[] = []
  for (const lib of ['lib', 'lib64']) {
    const libDir = join(venvDir, lib)
    let names: string[] = []
    try {
      names = await readdir(libDir)
    } catch {
      continue
    }
    for (const name of names.filter((n) => n.startsWith('python'))) {
      const sitePackages = join(libDir, name, 'site-packages')
      if (await isDirectory(sitePackages)) {
        found.push(sitePackages)
      }
    }
  }
  const windowsSitePackages = join(venvDir, 'Lib', 'site-packages')
  if (found.length === 0 && (await isDirectory(windowsSitePackages))) {
    found.push(windowsSitePackages)
  }
  return found
}

/** Reads `.pth` path lines as text; `import` lines are code and are never run. */
async function readPthPaths(sitePackages: string): Promise<string[]> {
  let names: string[] = []
  try {
    names = (await readdir(sitePackages)).filter((n) => n.endsWith('.pth'))
  } catch {
    return []
  }
  const paths: string[] = []
  for (const name of names) {
    const file = join(sitePackages, name)
    try {
      if ((await stat(file)).size > MAX_PTH_BYTES) {
        continue
      }
      for (const rawLine of (await readFile(file, 'utf8')).split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#') || /^import[\s\t]/.test(line)) {
          continue
        }
        const path = isAbsolute(line) ? line : join(sitePackages, line)
        if (paths.length < MAX_PTH_PATHS && (await isDirectory(path))) {
          paths.push(path)
        }
      }
    } catch {
      continue
    }
  }
  return paths
}

/**
 * Finds virtualenvs in the workspace root and its first-level project folders (`backend/.venv`)
 * by their `pyvenv.cfg`, without executing the environment's interpreter.
 */
export async function detectPythonEnvironments(rootPath: string): Promise<PythonEnvironment[]> {
  const projectDirs = [
    rootPath,
    ...(await childDirectories(rootPath)).slice(0, MAX_CHILD_DIRECTORIES)
  ]
  const candidates = projectDirs.flatMap((dir) => VENV_NAMES.map((name) => join(dir, name)))
  const environments: PythonEnvironment[] = []
  for (const venvDir of candidates) {
    if (!(await exists(join(venvDir, 'pyvenv.cfg')))) {
      continue
    }
    const sitePackages = await findSitePackages(venvDir)
    const pthPaths = (await Promise.all(sitePackages.map(readPthPaths))).flat()
    environments.push({ venvDir, searchPaths: [...new Set([...sitePackages, ...pthPaths])] })
  }
  return environments
}
