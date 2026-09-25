const { existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

// Why: `asarUnpack` in config/electron-builder.config.cjs lists
// out/main/daemon-entry.js on every platform, and the packaged daemon fork
// (src/main/daemon/daemon-init.ts) resolves exactly this unpacked path. A
// missing entry means the package layout regressed, so the check throws
// instead of skipping — a silent skip false-passed exactly the layout bug
// this gate exists to catch.
function assertPackagedDaemonEntryExists(resourcesDir) {
  const entryPath = join(resourcesDir, 'app.asar.unpacked', 'out', 'main', 'daemon-entry.js')
  if (!existsSync(entryPath)) {
    throw new Error(
      `[verify-packaged-daemon-entry] missing unpacked daemon entry at ${entryPath} — ` +
        `asarUnpack expects out/main/daemon-entry.js on every platform, so the packaged ` +
        `daemon cannot be forked from this layout`
    )
  }
  return entryPath
}

// Why: v1.4.129-rc.1 shipped a terminal daemon that could not load (an electron
// `require` leaked into its bundle) while every build check passed. This boots
// the PACKAGED daemon-entry under plain Node against the asar-unpacked layout,
// so a bundling / asar-unpack regression fails packaging instead of reaching
// users. Module-load proof only: with no args the entry must reach argv parsing
// and print its "Usage: daemon-entry" error — a MODULE_NOT_FOUND or a missing
// usage line means the packaged graph does not load and the build must fail.
//
// resourcesDir is the packaged Resources dir (Contents/Resources on macOS,
// <appOutDir>/resources elsewhere). execPath defaults to the packaging Node.
//
// Why 60s (was 10s): the entry dlopens node-pty's freshly written pty.node, and
// macOS scans every new Mach-O on first load. Mid-build, with the machine busy
// copying/zipping the bundle, that first load overran 10s on every local build
// of an Intel Mac even though the same file booted in 0.3s moments later.
const DEFAULT_BOOT_TIMEOUT_MS = 60_000

function resolveBootTimeoutMs(options) {
  if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return options.timeoutMs
  }
  const fromEnv = Number(process.env.ORCA_DAEMON_ENTRY_BOOT_TIMEOUT_MS)
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_BOOT_TIMEOUT_MS
}

function verifyPackagedDaemonEntryBoots(resourcesDir, options = {}) {
  const execPath = options.execPath || process.execPath
  const entryPath = assertPackagedDaemonEntryExists(resourcesDir)
  const timeoutMs = resolveBootTimeoutMs(options)

  const result = spawnSync(execPath, [entryPath], { encoding: 'utf8', timeout: timeoutMs })
  const stderr = result.stderr || ''
  if (result.error) {
    // Why: the usage line proves the module graph loaded — the only thing this
    // gate checks — so a process that printed it but was slow to exit passes.
    if (result.error.code === 'ETIMEDOUT' && stderr.includes('Usage: daemon-entry')) {
      console.warn(
        `[verify-packaged-daemon-entry] OK (slow exit) — daemon-entry reached argv parsing but ` +
          `did not exit within ${timeoutMs}ms`
      )
      return
    }
    const timeoutHint =
      result.error.code === 'ETIMEDOUT'
        ? ` (no usage line within ${timeoutMs}ms; raise ORCA_DAEMON_ENTRY_BOOT_TIMEOUT_MS if the ` +
          `machine is under heavy load). stderr so far:\n${stderr || '(empty)'}`
        : ''
    throw new Error(
      `[verify-packaged-daemon-entry] could not launch daemon-entry.js: ${result.error.message}${timeoutHint}`
    )
  }
  if (/Cannot find module|MODULE_NOT_FOUND/.test(stderr)) {
    throw new Error(
      `[verify-packaged-daemon-entry] packaged daemon-entry.js failed to load under plain Node:\n${stderr}`
    )
  }
  if (!stderr.includes('Usage: daemon-entry')) {
    throw new Error(
      `[verify-packaged-daemon-entry] packaged daemon-entry.js did not reach argv parsing ` +
        `(expected the "Usage: daemon-entry" error). stderr:\n${stderr}`
    )
  }
  console.log('[verify-packaged-daemon-entry] OK — packaged daemon-entry loads under plain Node')
}

module.exports = { assertPackagedDaemonEntryExists, verifyPackagedDaemonEntryBoots }
