import { router } from '@/router/reader/electron-main'
import { startCrawler } from '@/services/reader/electron-main/crawler'
import { logger } from '@/services/logger/electron-main/logger'
import { init as initDB } from './db'

export function createApp() {
  const ready = initDB()
  router.listen(ready)
  ready.then(startCrawler).catch((error) => logger.error('[Reader] Database initialization failed', error))
}
