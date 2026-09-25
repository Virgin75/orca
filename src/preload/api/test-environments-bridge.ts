import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const testEnvironmentsApi = {
  allocateLocalPorts: (count) => ipcRenderer.invoke('testEnvironments:allocateLocalPorts', count),
  syncRuns: (runs) => ipcRenderer.send('testEnvironments:syncRuns', runs)
} satisfies PreloadApi['testEnvironments']
