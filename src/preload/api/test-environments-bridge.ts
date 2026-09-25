import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const testEnvironmentsApi = {
  allocateLocalPorts: (count) => ipcRenderer.invoke('testEnvironments:allocateLocalPorts', count)
} satisfies PreloadApi['testEnvironments']
