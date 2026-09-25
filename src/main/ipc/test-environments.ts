import { ipcMain } from 'electron'
import { allocateLocalFreePorts } from '../test-environments/local-free-ports'
import { syncTestEnvironmentRuns } from '../test-environments/test-environment-run-registry'

export function registerTestEnvironmentHandlers(): void {
  ipcMain.handle('testEnvironments:allocateLocalPorts', (_event, count: unknown) =>
    allocateLocalFreePorts(typeof count === 'number' && Number.isFinite(count) ? count : 0)
  )
  ipcMain.on('testEnvironments:syncRuns', (_event, runs: unknown) => syncTestEnvironmentRuns(runs))
}
