import {
  run, get, all, transaction,
} from '@/services/db/electron-main/db'
import { push } from '@/services/push/electron-main/push'
import { Feed } from '@/types/reader'
import { equivalentFeedUrls, feedUrlKey } from '@/base/common/feed-url'

export type FeedToRefresh = Pick<Feed, 'url' | 'etag' | 'lastModified'> & {
  id: number
  subscriptionRevision: number
}

const refreshColumns = 'id, url, etag, lastModified, subscriptionRevision'

export const upsert = async ({
  url, title, description = '', link = '',
}: Feed) => {
  const saved = await get<FeedToRefresh>(`
    INSERT INTO feeds (url, title, description, link)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title, description = excluded.description, link = excluded.link, subscribed = 1
    RETURNING ${refreshColumns}
  `, url, title, description, link)
  return saved!
}

export const getByUrl = (url: string) => {
  const alternatives = equivalentFeedUrls(url)
  return get<Feed>(`
    SELECT id, url, title FROM feeds WHERE url IN (${alternatives.map(() => '?').join(',')})
    ORDER BY subscribed DESC, (url = ?) DESC, id LIMIT 1
  `, ...alternatives, url)
}

export const getAll = (): Promise<Feed[]> => {
  const sql = `
    select f.id, f.url, f.title, f.description, f.link, f.createTime, f.etag, f.lastModified, count(a.id) as unreadCount
    from feeds as f left outer join articles as a
    on f.id = a.feedId and a.read = 0
    where f.subscribed = 1
    group by f.id
    order by f.createTime desc, f.id desc;
  `

  return all(sql)
}

export const getSubscriptions = (): Promise<Feed[]> => (
  all('SELECT url, title, description, link FROM feeds WHERE subscribed = 1 ORDER BY createTime DESC, id DESC')
)

export const importSubscriptions = (feeds: readonly Feed[]) => transaction(async () => {
  const existing = await all<{ url: string; subscribed: 0 | 1 }>(
    'SELECT url, subscribed FROM feeds ORDER BY subscribed ASC, id DESC',
  )
  const byUrl = new Map(existing.map((feed) => [feedUrlKey(feed.url), feed]))
  const added: FeedToRefresh[] = []
  for (const feed of feeds) {
    const key = feedUrlKey(feed.url)
    const previous = byUrl.get(key)
    if (!previous?.subscribed) {
      // eslint-disable-next-line no-await-in-loop -- Each activation resolves duplicates in the same import.
      const saved = await upsert({ ...feed, url: previous?.url ?? feed.url })
      byUrl.set(key, { url: saved.url, subscribed: 1 })
      added.push(saved)
    }
  }
  return added
})

export const getRefreshFeeds = () => all<FeedToRefresh>(`
  SELECT ${refreshColumns} FROM feeds WHERE subscribed = 1 ORDER BY createTime DESC, id DESC
`)

export const isCurrentSubscription = async ({ id, subscriptionRevision }: FeedToRefresh) => {
  const sql = 'SELECT id FROM feeds WHERE id = ? AND subscribed = 1 AND subscriptionRevision = ?'
  return !!await get(sql, id, subscriptionRevision)
}

export const getOne = (id: number): Promise<Feed | undefined> => {
  const sql = `
    select f.id, f.url, f.title, f.description, f.link, f.createTime, f.etag, f.lastModified,
      (select count(*) from articles as a where a.feedId = f.id and a.read = 0) as unreadCount
    from feeds as f
    where f.id = ? and f.subscribed = 1;
  `

  return get(sql, id)
}

export const unsubscribe = (id: number) => run(`
  UPDATE feeds SET subscribed = 0, subscriptionRevision = subscriptionRevision + 1
  WHERE id = ? AND subscribed = 1
`, id)

export const updateValidators = (id: number, etag?: string, lastModified?: string) => (
  run('UPDATE feeds SET etag = ?, lastModified = ? WHERE id = ?', etag ?? null, lastModified ?? null, id)
)

export const pushAll = async () => {
  const feeds = await getAll()

  push('/reader/feed', feeds)
}

export const pushOne = async (id: number) => {
  const feed = await getOne(id)

  push('/reader/feed', feed)
}
