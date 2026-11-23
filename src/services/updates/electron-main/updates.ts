import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { app } from 'electron'
import { logger } from '@/services/logger/electron-main/logger'
import { push } from '@/services/push/electron-main/push'
import { Router } from '@/services/router/electron-main/router'
import type { UpdateState } from '@/types/update'
import { UpdateManager, type UpdateClient } from './update-manager'

const checkInterval = 6 * 60 * 60 * 1000
const router = new Router({ prefix: '/update' })
const requireMain = createRequire(__filename)
let manager: UpdateManager | undefined

const reportError = (error: unknown) => logger.warn('[Update] Unable to update the application', error)

router.use('/status', (): UpdateState => manager?.status ?? { status: 'idle' })
router.use('/install', () => manager?.install())

function macClient(): UpdateClient | undefined {
  const bridge = join(process.resourcesPath, 'laikan-updater.node')
  if (!existsSync(bridge)) return undefined
  return requireMain(bridge)
}

function electronClient(): UpdateClient {
  // electron-updater exposes its platform-specific singleton as a CommonJS getter.
  const { autoUpdater } = requireMain('electron-updater') as typeof import('electron-updater')
  autoUpdater.logger = logger
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.on('error', reportError)

  return {
    check: async () => {
      const result = await autoUpdater.checkForUpdates()
      return result?.isUpdateAvailable ? result.updateInfo.version : undefined
    },
    install: async (version, onProgress) => {
      logger.info('[Update] Downloading %s', version)
      const onDownload = ({ percent }: { percent: number }) => onProgress(percent)
      autoUpdater.on('download-progress', onDownload)
      try {
        await autoUpdater.downloadUpdate()
      } finally {
        autoUpdater.off('download-progress', onDownload)
      }

      // quitAndInstall dispatches preparation errors synchronously.
      let failure: Error | undefined
      const onInstallError = (error: Error) => { failure = error }
      autoUpdater.once('error', onInstallError)
      try {
        // Skip the NSIS wizard and reopen the app after installation.
        autoUpdater.quitAndInstall(true, true)
        if (failure) throw failure
      } finally {
        autoUpdater.off('error', onInstallError)
      }
    },
  }
}

export function registerUpdates() {
  router.listen()
  if (!app.isPackaged) return

  app.whenReady().then(() => {
    const client = process.platform === 'darwin' ? macClient() : electronClient()
    if (!client) return

    const updates = new UpdateManager({
      client,
      currentVersion: app.getVersion(),
      notify: () => push('/update/change', null),
      report: reportError,
    })
    manager = updates
    const check = () => { updates.check() }
    const timer = setInterval(check, checkInterval)
    timer.unref()
    app.once('will-quit', () => clearInterval(timer))
    check()
  }).catch(reportError)
}
