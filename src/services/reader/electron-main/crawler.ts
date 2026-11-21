import { fetchFeed } from '@/base/node/feed'
import { runConcurrent } from '@/base/common/async'
import { transaction } from '@/services/db/electron-main/db'
import { logger } from '@/services/logger/electron-main/logger'
import { FeedRefreshResult } from '@/types/reader'
import * as feedService from './feed'
import * as articleService from './article'

const crawlOne = async (source: feedService.FeedToRefresh) => {
  try {
    if (!await feedService.isCurrentSubscription(source)) return true
    const result = await fetchFeed(source.url, {
      force: true, etag: source.etag, lastModified: source.lastModified,
    })
    const saved = await transaction(async () => {
      // A request started before cancellation belongs to the previous subscription.
      if (!await feedService.isCurrentSubscription(source)) return false
      if (result.status === 'modified') {
        await articleService.upsert((result.feed.items ?? []).map((article) => ({ ...article, feedId: source.id })))
      }
      await feedService.updateValidators(source.id, result.etag, result.lastModified)
      return result.status === 'modified'
    })
    if (saved) await feedService.pushOne(source.id)
    return true
  } catch (error) {
    const host = URL.parse(source.url)?.hostname ?? 'unknown host'
    const reason = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`[Reader] Feed refresh failed (feed #${source.id ?? '?'}, ${host}): ${reason}`)
    return false
  }
}

async function crawlFeeds(feeds: readonly feedService.FeedToRefresh[]): Promise<FeedRefreshResult> {
  let failed = 0
  await runConcurrent(feeds, 4, async (feed) => {
    if (!await crawlOne(feed)) failed += 1
  })
  return { succeeded: feeds.length - failed, failed }
}

let running: Promise<FeedRefreshResult> | undefined
let queued: Promise<unknown> = Promise.resolve()

function queueRefresh(refresh: () => Promise<FeedRefreshResult>) {
  const result = queued.then(refresh)
  queued = result.catch(() => undefined)
  return result
}

export function refreshFeeds() {
  running ??= queueRefresh(async () => crawlFeeds(await feedService.getRefreshFeeds()))
    .finally(() => { running = undefined })
  return running
}

export function refreshImportedFeeds(feeds: readonly feedService.FeedToRefresh[]) {
  return queueRefresh(() => crawlFeeds(feeds))
}

export const startCrawler = () => {
  let timer: ReturnType<typeof setTimeout>
  const crawl = async () => {
    try {
      await refreshFeeds()
    } catch (error) {
      logger.error('[Reader] Crawl error', error)
    } finally {
      timer = setTimeout(crawl, 15 * 60e3)
    }
  }
  timer = setTimeout(crawl, 3e3)
  return () => clearTimeout(timer)
}
