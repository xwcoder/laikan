import { router } from '@/router/reader/electron-main'
import { withReaderLibrary } from '@/services/db/electron-main/db'
import { startCrawler } from '@/services/reader/electron-main/crawler'

export function createApp() {
  router.listen(withReaderLibrary)
  startCrawler()
}
