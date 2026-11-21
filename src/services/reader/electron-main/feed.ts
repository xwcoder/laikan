import {
  run, get, all, transaction,
} from '@/services/db/electron-main/db'
import { push } from '@/services/push/electron-main/push'
import { Feed } from '@/types/reader'
import { httpUrl } from '@/base/common/url'

export const upsert = (feed: Feed) => {
  const {
    url, title, description = '', link = '',
  } = feed
  const sql = `
    insert into feeds (url, title, description, link)
    values ($url, $title, $description, $link)
    on conflict(url) do update set title = $title, description = $description, link = $link
  `
  // @ts-ignore
  return run(sql, {
    $url: url,
    $title: title,
    $description: description,
    $link: link,
  })
}

export const getByUrl = async (url: string) => {
  const sql = 'select * from feeds where url = ?'
  const row = await get(sql, url)

  if (row) {
    return row as Feed
  }

  return null
}

export const getAll = (): Promise<Feed[]> => {
  const sql = `
    select f.*, count(a.id) as unreadCount
    from feeds as f left outer join articles as a
    on f.id = a.feedId and a.read = 0
    group by f.id
    order by createTime desc;
  `

  return all(sql)
}

export const getSubscriptions = (): Promise<Feed[]> => (
  all('SELECT url, title, description, link FROM feeds ORDER BY createTime DESC, id DESC')
)

export const importSubscriptions = (feeds: readonly Feed[]) => transaction(async () => {
  const existing = await getSubscriptions()
  const urls = new Set(existing.map(({ url }) => httpUrl(url) ?? url))
  const added: Feed[] = []
  for (const feed of feeds) {
    if (!urls.has(feed.url)) {
      // eslint-disable-next-line no-await-in-loop -- Insert each subscription before processing a duplicate.
      const { lastID } = await upsert(feed)
      urls.add(feed.url)
      added.push({ ...feed, id: lastID })
    }
  }
  return added
})

export const getOne = (id: number): Promise<Feed | undefined> => {
  const sql = `
    select f.*, (select count(*) from articles as a where a.feedId = f.id and a.read = 0) as unreadCount
    from feeds as f
    where f.id = ?;
  `

  return get(sql, id)
}

export const deleteById = (id: number) => transaction(async () => {
  await run('DELETE FROM articles WHERE feedId = ?', id)
  await run('DELETE FROM feeds WHERE id = ?', id)
})

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
