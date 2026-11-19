import {
  app,
  ipcMain,
  shell,
  dialog,
} from 'electron'
import { OpenDialogOptions } from '@/types/common'
import { externalUrl } from '@/base/common/url'
import { logger } from '@/services/logger/electron-main/logger'

const regist = () => {
  ipcMain.on('open:external', (_, value: unknown) => {
    const url = typeof value === 'string' ? externalUrl(value) : undefined
    if (url) shell.openExternal(url).catch((error) => logger.error('Unable to open external link', error))
  })

  ipcMain.handle('open:directory', (_, options: OpenDialogOptions = {}) => dialog.showOpenDialog({
    ...options,
    properties: [
      'openDirectory',
      ...(options.properties || []),
    ].filter((v) => v !== 'openFile') as OpenDialogOptions['properties'],
  }))
}

export const register = () => {
  app.whenReady()
    .then(() => {
      regist()
    })
}
