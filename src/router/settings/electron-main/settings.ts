import { changeDataPath, getLibraryRevision } from '@/services/db/electron-main/db'
import { Router } from '@/services/router/electron-main/router'
import * as settingService from '@/services/settings/electron-main/settings'

export const router = new Router({ prefix: '/settings' })

router.use('get', (_, path) => (
  path ? settingService.get(path) : { ...settingService.get(), libraryRevision: getLibraryRevision() }
))

router.use('set', (_, { path, value }: { path: string, value: unknown }) => {
  if (path === 'dataPath') return changeDataPath(value)
  if (!['appearance', 'theme', 'locale', 'reader.fontSize', 'reader.refreshInterval'].includes(path)) {
    throw new TypeError('Unknown setting')
  }
  return settingService.set(path, value)
})
