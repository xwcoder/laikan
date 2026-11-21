import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { isDev, isMac } from '@/base/electron-main/env'

const profile = isDev ? 'laikan-dev' : 'laikan'
const requestedPath = app.commandLine.getSwitchValue('user-data-dir')
const userDataPath = requestedPath ? resolve(requestedPath) : join(app.getPath('appData'), profile)

mkdirSync(userDataPath, { recursive: true, mode: 0o700 })
app.setPath('userData', userDataPath)
app.setPath('sessionData', userDataPath)

if (isDev && isMac) {
  app.whenReady().then(() => app.dock?.setIcon(join(__dirname, '../../assets/icons/icon-mac.png')))
}
