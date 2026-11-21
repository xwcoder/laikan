import { bundledFeedIcon } from '@/base/common/recommended-icons'
import { fetchFeedIcon } from '@/base/node/feed/icon'
import { get, run } from '@/services/db/electron-main/db'
import { logger } from '@/services/logger/electron-main/logger'
import { push } from '@/services/push/electron-main/push'
import { Feed } from '@/types/reader'
import { createFeedIconDecoder } from './decode-icon'
import type { FeedToRefresh } from './feed'

type IconRecord = {
  iconUrl: string | null
  websiteUrl: string | null
  checkedAt: number | null
  needsFetch: 0 | 1
}

const currentSubscription = `
  feedId = ? AND EXISTS (
    SELECT 1 FROM feeds WHERE id = feed_icons.feedId AND subscribed = 1 AND subscriptionRevision = ?
  )
`
const retryInterval = 24 * 60 * 60 * 1000
const decoder = createFeedIconDecoder()

function bundledPng(url: string) {
  const icon = bundledFeedIcon(url)
  return icon ? Buffer.from(icon.slice('data:image/png;base64,'.length), 'base64') : null
}

export function registerFeedIcon(id: number, feed: Feed) {
  const png = bundledPng(feed.url)
  return run(`
    INSERT INTO feed_icons (feedId, png, iconUrl, websiteUrl, needsFetch) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(feedId) DO UPDATE SET png = excluded.png, needsFetch = 0
    WHERE excluded.png IS NOT NULL
  `, id, png, feed.iconUrl ?? null, feed.link || null, png ? 0 : 1)
}

export function updateFeedIconSource(id: number, feed: Feed) {
  if (bundledFeedIcon(feed.url)) return undefined
  const icon = feed.iconUrl ?? null
  const website = feed.link || null
  // Updating only existing records leaves subscriptions from before icon support untouched.
  return run(`
    UPDATE feed_icons SET iconUrl = ?, websiteUrl = ?, checkedAt = NULL, needsFetch = 1
    WHERE feedId = ? AND (iconUrl IS NOT ? OR websiteUrl IS NOT ?)
  `, icon, website, id, icon, website)
}

async function refreshBundledIcon({ id, subscriptionRevision }: FeedToRefresh, png: Buffer) {
  const { changes } = await run(`
    UPDATE feed_icons SET png = ?, needsFetch = 0
    WHERE ${currentSubscription} AND png IS NOT ?
  `, png, id, subscriptionRevision, png)
  if (changes) push('/reader/feed', undefined)
}

async function refreshFeedIcon(source: FeedToRefresh, manual: boolean) {
  const { id, url, subscriptionRevision } = source
  const bundled = bundledPng(url)
  if (bundled) {
    await refreshBundledIcon(source, bundled)
    return
  }
  const record = await get<IconRecord>(`
    SELECT iconUrl, websiteUrl, checkedAt, needsFetch FROM feed_icons WHERE ${currentSubscription}
  `, id, subscriptionRevision)
  if (!record?.needsFetch) return
  const { iconUrl, websiteUrl, checkedAt } = record
  if (!manual && checkedAt !== null && Date.now() - checkedAt < retryInterval) return

  const png = await fetchFeedIcon({ url, iconUrl, websiteUrl }, decoder.decode)
  const { changes } = await run(`
    UPDATE feed_icons SET png = coalesce(?, png), checkedAt = ?, needsFetch = ?
    WHERE ${currentSubscription} AND iconUrl IS ? AND websiteUrl IS ?
  `, png ?? null, Date.now(), png ? 0 : 1, id, subscriptionRevision, iconUrl, websiteUrl)
  if (changes && png) push('/reader/feed', undefined)
}

const pending = new Map<number, { source: FeedToRefresh; manual: boolean }>()
const refreshing = new Set<number>()

function startIconJobs() {
  for (const [id, { source, manual }] of pending) {
    if (refreshing.size >= 3) break
    if (!refreshing.has(id)) {
      pending.delete(id)
      refreshing.add(id)
      refreshFeedIcon(source, manual)
        .finally(() => {
          refreshing.delete(id)
          startIconJobs()
          if (!refreshing.size) return decoder.close()
          return undefined
        })
        .catch((error) => logger.error(`[Reader] Unable to update icon for feed #${id}`, error))
    }
  }
}

export function queueFeedIconRefresh(source: FeedToRefresh, manual = false) {
  const previous = pending.get(source.id)
  if (previous && previous.source.subscriptionRevision > source.subscriptionRevision) return
  pending.set(source.id, { source, manual: manual || previous?.manual === true })
  startIconJobs()
}
