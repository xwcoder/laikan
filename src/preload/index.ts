import { contextBridge, ipcRenderer } from 'electron'
import { OpenDialogOptions } from '@/types/common'

export type Listener = (...args: any[]) => void

contextBridge.exposeInMainWorld('laikan', {
  fetch: (ch: string, data?: any, revision?: number) => ipcRenderer.invoke(ch, data, revision),

  on: (ch: string, listener: Listener) => {
    const wrapped: Parameters<typeof ipcRenderer.on>[1] = (_, ...args) => listener(...args)
    ipcRenderer.on(ch, wrapped)

    return () => {
      ipcRenderer.removeListener(ch, wrapped)
    }
  },

  openExternal: (url: string) => ipcRenderer.send('open:external', url),

  openDirectory: (options: OpenDialogOptions) => ipcRenderer.invoke('open:directory', options),
})
