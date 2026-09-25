import { ipcMain } from 'electron'
import { allocateLocalFreePorts } from '../test-environments/local-free-ports'

export function registerTestEnvironmentHandlers(): void {
  ipcMain.handle('testEnvironments:allocateLocalPorts', (_event, count: unknown) =>
    allocateLocalFreePorts(typeof count === 'number' && Number.isFinite(count) ? count : 0)
  )
}
