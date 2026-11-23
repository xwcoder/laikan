import '@/main/setup'
import { app } from 'electron'
import { isMac } from '@/base/electron-main/env'
import { createPushChannel } from '@/services/push/electron-main/push'
import { register as registerCommands } from '@/services/commands/electron-main/commands'
import { registerUpdates } from '@/services/updates/electron-main/updates'
import { createWindow } from '@/services/window/electron-main/window'
import * as themeService from '@/services/theme/electron-main/theme'
import { createApp as createReaderApp } from './reader'
import { createApp as createSettingsApp } from './setttings'

registerCommands()
registerUpdates()

createSettingsApp()
createReaderApp()

const window = createWindow()
createPushChannel(window)

themeService.init()

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})
