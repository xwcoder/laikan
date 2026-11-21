import '@/main/setup'
import * as fs from 'node:fs'
import { app } from 'electron'
import { isMac } from '@/base/electron-main/env'
import { getDatabasePath } from '@/services/db/electron-main/db'
import { createPushChannel } from '@/services/push/electron-main/push'
import { register as registerCommands } from '@/services/commands/electron-main/commands'
import { createWindow } from '@/services/window/electron-main/window'
import * as themeService from '@/services/theme/electron-main/theme'
import * as settingService from '@/services/settings/electron-main/settings'
import { createApp as createReaderApp } from './reader'
import { createApp as createSettingsApp } from './setttings'

registerCommands()

createSettingsApp()
createReaderApp()

const window = createWindow()
createPushChannel(window)

themeService.init()

settingService.on('change', (path, dataPath, oldDataPath) => {
  if (path !== 'dataPath' || !dataPath) {
    return
  }

  const destination = getDatabasePath(dataPath)
  if (!fs.existsSync(destination)) {
    fs.renameSync(getDatabasePath(oldDataPath), destination)
  }

  app.relaunch()
  app.exit()
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})
