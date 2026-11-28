import { app, powerMonitor } from 'electron'
import { fetchFeed } from '@/base/node/feed'
import { runConcurrent } from '@/base/common/async'
import { normalizeRefreshInterval } from '@/base/common/refresh-interval'
import {
  get, getLibraryRevision, isCurrentLibrary, onLibraryChange, ReaderLibraryChangedError, run, transaction,
  withCurrentLibrary, withReaderLibrary,
} from '@/services/db/electron-main/db'
import * as settingService from '@/services/settings/electron-main/settings'
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

const lastRefreshKey = 'lastFeedRefreshAt'

async function getLastRefresh() {
  const row = await get<{ value: unknown }>('SELECT value FROM meta WHERE key = ?', lastRefreshKey)
  return typeof row?.value === 'number' && Number.isFinite(row.value) ? row.value : undefined
}

async function recordRefresh(time: number) {
  try {
    await run(`
      INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `, lastRefreshKey, time)
  } catch (error) {
    // A refresh interrupted by a library switch did not cover the new library.
    if (!(error instanceof ReaderLibraryChangedError)) throw error
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
let scheduleCrawl: (() => void) | undefined

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
  const result = queueRefresh(async () => {
    try {
      return await crawlFeeds(await feedService.getRefreshFeeds(), manual)
    } finally {
      // Record failed rounds too, so a persistent error waits for the next interval instead of retrying.
      await recordRefresh(Date.now())
    }
  })
    .finally(() => {
      if (queue.running?.result === result) queue.running = undefined
      // Every full refresh, manual or automatic, restarts the interval.
      scheduleCrawl?.()
    })
  queue.running = { result, manual }
  return result
}

export async function refreshImportedFeeds(feeds: readonly feedService.FeedToRefresh[]) {
  return queueRefresh(() => crawlFeeds(feeds))
}

// Leaves time for startup, wake-up or a library switch to settle before an overdue refresh.
const minimumDelay = 5e3

export const startCrawler = () => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let stopped = false

  const crawl = async () => {
    timer = undefined
    try {
      await refreshFeeds()
    } catch (error) {
      if (!(error instanceof ReaderLibraryChangedError)) logger.error('[Reader] Crawl error', error)
      scheduleCrawl?.()
    }
  }

  // The next refresh is always derived from the time stored in the active library.
  const schedule = () => withCurrentLibrary(async () => {
    generation += 1
    const current = generation
    clearTimeout(timer)
    timer = undefined
    const interval = normalizeRefreshInterval(settingService.get('reader.refreshInterval')) * 60e3
    if (stopped || !interval) return
    let last: number | undefined
    try {
      last = await getLastRefresh()
    } catch (error) {
      // The library change listener schedules against the new library.
      if (error instanceof ReaderLibraryChangedError) return
      logger.error('[Reader] Unable to read last refresh time', error)
      last = Date.now()
    }
    if (stopped || current !== generation) return
    const now = Date.now()
    // A time in the future means the clock moved back; treat it as a refresh that just finished.
    const elapsed = last === undefined ? Infinity : Math.max(0, now - last)
    timer = setTimeout(crawl, Math.max(minimumDelay, interval - elapsed))
  })

  scheduleCrawl = schedule
  const stopLibraryListener = onLibraryChange(schedule)
  const onSettingChange = (path: string) => {
    if (path === 'reader.refreshInterval') schedule()
  }
  settingService.on('change', onSettingChange)
  // Timers may not advance during sleep, so re-evaluate the stored time after waking.
  const ready = app.whenReady().then(() => {
    if (!stopped) powerMonitor.on('resume', schedule)
  })
  schedule()

  return () => {
    stopped = true
    if (scheduleCrawl === schedule) scheduleCrawl = undefined
    stopLibraryListener()
    settingService.off('change', onSettingChange)
    ready.then(() => powerMonitor.off('resume', schedule))
    clearTimeout(timer)
  }
}
