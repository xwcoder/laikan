import { fetchFeed } from '@/base/node/feed'
import { runConcurrent } from '@/base/common/async'
import { transaction } from '@/services/db/electron-main/db'
import { logger } from '@/services/logger/electron-main/logger'
import { Feed } from '@/types/reader'
import * as feedService from './feed'
import * as articleService from './article'

const crawlOne = async (source: Feed) => {
  try {
    const result = await fetchFeed(source.url, {
      force: true, etag: source.etag, lastModified: source.lastModified,
    })
    if (result.status === 'not-modified') {
      await feedService.updateValidators(source.id!, result.etag, result.lastModified)
      return
    }
    const saved = await transaction(async () => {
      // A feed can be deleted while its HTTP request is still in flight.
      if (!await feedService.getOne(source.id!)) return false
      await articleService.upsert((result.feed.items ?? []).map((article) => ({ ...article, feedId: source.id })))
      await feedService.updateValidators(source.id!, result.etag, result.lastModified)
      return true
    })
    if (saved) await feedService.pushOne(source.id!)
  } catch (error) {
    logger.error('[Reader] Feed refresh failed', error)
  }
}

export const startCrawler = () => {
  let timer: ReturnType<typeof setTimeout>
  const crawl = async () => {
    try {
      const feeds = await feedService.getAll()
      await runConcurrent(feeds, 4, crawlOne)
    } catch (error) {
      logger.error('[Reader] Crawl error', error)
    } finally {
      timer = setTimeout(crawl, 15 * 60e3)
    }
  }
  timer = setTimeout(crawl, 3e3)
  return () => clearTimeout(timer)
}
