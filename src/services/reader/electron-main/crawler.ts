import { fetchFeed } from '@/base/node/feed'
import { runConcurrent } from '@/base/common/async'
import {
  getLibraryRevision, isCurrentLibrary, ReaderLibraryChangedError, transaction, withReaderLibrary,
} from '@/services/db/electron-main/db'
import { logger } from '@/services/logger/electron-main/logger'
import { FeedRefreshResult } from '@/types/reader'
import * as feedService from './feed'
import * as articleService from './article'
import { queueFeedIconRefresh, updateFeedIconSource } from './feed-icon'

const crawlOne = async (source: feedService.FeedToRefresh, manual: boolean) => {
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
        await updateFeedIconSource(source.id, result.feed)
      }
      await feedService.updateValidators(source.id, result.etag, result.lastModified)
      return result.status === 'modified'
    })
    if (saved) await feedService.pushOne(source.id)
    return true
  } catch (error) {
    if (error instanceof ReaderLibraryChangedError) return false
    const host = URL.parse(source.url)?.hostname ?? 'unknown host'
    const reason = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`[Reader] Feed refresh failed (feed #${source.id ?? '?'}, ${host}): ${reason}`)
    return false
  } finally {
    queueFeedIconRefresh(source, manual)
  }
}

async function crawlFeeds(feeds: readonly feedService.FeedToRefresh[], manual = false): Promise<FeedRefreshResult> {
  let failed = 0
  await runConcurrent(feeds, 4, async (feed) => {
    if (!await crawlOne(feed, manual)) failed += 1
  })
  return { succeeded: feeds.length - failed, failed }
}

type RefreshQueue = {
  revision: number
  pending: Promise<unknown>
  running?: { result: Promise<FeedRefreshResult>; manual: boolean }
}

let currentQueue: RefreshQueue = { revision: 0, pending: Promise.resolve() }

function getRefreshQueue() {
  if (!isCurrentLibrary()) throw new ReaderLibraryChangedError()
  const revision = getLibraryRevision()
  if (currentQueue.revision !== revision) currentQueue = { revision, pending: Promise.resolve() }
  return currentQueue
}

function queueRefresh(refresh: () => Promise<FeedRefreshResult>) {
  const queue = getRefreshQueue()
  const result = withReaderLibrary(() => queue.pending.then(refresh))
  queue.pending = result.catch(() => undefined)
  return result
}

export async function refreshFeeds(manual = false) {
  const queue = getRefreshQueue()
  if (queue.running && (!manual || queue.running.manual)) return queue.running.result
  const result = queueRefresh(async () => crawlFeeds(await feedService.getRefreshFeeds(), manual))
    .finally(() => {
      if (queue.running?.result === result) queue.running = undefined
    })
  queue.running = { result, manual }
  return result
}

export async function refreshImportedFeeds(feeds: readonly feedService.FeedToRefresh[]) {
  return queueRefresh(() => crawlFeeds(feeds))
}

export const startCrawler = () => {
  let timer: ReturnType<typeof setTimeout>
  const crawl = async () => {
    try {
      await refreshFeeds()
    } catch (error) {
      if (!(error instanceof ReaderLibraryChangedError)) logger.error('[Reader] Crawl error', error)
    } finally {
      timer = setTimeout(crawl, 60 * 60e3)
    }
  }
  timer = setTimeout(crawl, 3e3)
  return () => clearTimeout(timer)
}
