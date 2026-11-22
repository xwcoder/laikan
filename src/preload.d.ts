import type { Listener } from '@/preload/index'
import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron'

type Laikan = {
  fetch: (ch: string, data?: any, revision?: number) => any

  on: (ch: string, listener: Listener) => () => void

  openExternal: (url: string) => void

  openDirectory: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>
}

declare global {
  interface Window {
    laikan: Laikan,
  }
}
