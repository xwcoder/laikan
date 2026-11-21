import { Feed } from '@/types/reader'
import * as feedService from '@/services/reader/electron-main/feed'
import * as articleService from '@/services/reader/electron-main/article'
import { refreshFeeds } from '@/services/reader/electron-main/crawler'
import { parseURL, FeedError } from '@/base/node/feed'
import { logger } from '@/services/logger/electron-main/logger'
import { httpUrl } from '@/base/common/url'
import { transaction } from '@/services/db/electron-main/db'
import { router } from './router'

router.get('/feed/preflight', async (_, url: string) => {
  try {
    const feed = await parseURL(url)
    delete feed?.items

    return feed
  } catch (e) {
    logger.error('[Reader] feed/preflight error:', e)
    return { error: e instanceof FeedError ? e.kind : 'network' }
  }
})

router.post('/feed', async (_, { url, title }: Pick<Feed, 'url'|'title'>) => {
  const normalized = httpUrl(url)
  if (!normalized) throw new Error('Feed URL must use HTTP or HTTPS')
  if (typeof title !== 'string' || !title.trim()) throw new Error('Feed title is required')
  const existing = await feedService.getByUrl(normalized) ?? await feedService.getByUrl(url)
  let parsed: Feed
  try {
    parsed = await parseURL(normalized, { force: !!existing })
  } catch (error) {
    if (error instanceof FeedError) return { error: error.kind }
    throw error
  }
  const id = await transaction(async () => {
    const stored = await feedService.getByUrl(normalized) ?? await feedService.getByUrl(url)
    const feed: Feed = { ...parsed, url: stored?.url ?? parsed.url, title: title.trim() }
    const saved = await feedService.upsert(feed)
    await articleService.upsert((feed.items ?? []).map((article) => ({ ...article, feedId: saved.id })))
    await feedService.updateValidators(saved.id, feed.etag, feed.lastModified)
    return saved.id
  })
  await feedService.pushOne(id)
  return undefined
})

router.get('/feed/all', async () => feedService.getAll())

router.post('/feed/refresh', () => refreshFeeds())

router.delete('/feed', async (_, id: number) => {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Invalid feed ID')
  const { changes } = await feedService.unsubscribe(id)
  if (changes) await feedService.pushAll()
})
