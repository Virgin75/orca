import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BundledLanguageServerPackage } from './language-server-launch'

/**
 * Packaged builds run servers from `Resources/language-servers/<name>` (real files, since
 * ELECTRON_RUN_AS_NODE cannot read app.asar); dev and e2e builds use the checkout's node_modules.
 */
export function createLanguageServerPackageDir(options: {
  isPackaged: boolean
  resourcesPath: string
  searchFrom: readonly string[]
}): (name: BundledLanguageServerPackage) => string {
  return (name) => {
    if (options.isPackaged) {
      return join(options.resourcesPath, 'language-servers', name)
    }
    for (const start of options.searchFrom) {
      for (let dir = start; ; dir = dirname(dir)) {
        const candidate = join(dir, 'node_modules', name)
        if (existsSync(join(candidate, 'package.json'))) {
          return candidate
        }
        if (dirname(dir) === dir) {
          break
        }
      }
    }
    return join(options.searchFrom[0] ?? '.', 'node_modules', name)
  }
}
