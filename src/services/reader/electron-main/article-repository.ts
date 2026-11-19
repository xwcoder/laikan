import { DatabaseClient } from '@/base/node/database'
import { articleIdentity } from '@/base/node/feed/identity'
import { httpUrl } from '@/base/common/url'
import { Article, ArticleFilter } from '@/types/reader'

const columns = [
  'title',
  'url',
  'content',
  'pubTime',
  'author',
  'feedId',
  'externalId',
  'identityKey',
  'contentBase',
] as const
const placeholders = columns.map(() => '?').join(',')
const updates = columns
  .filter((name) => name !== 'feedId' && name !== 'identityKey')
  .map((name) => `${name}=excluded.${name}`)
  .join(',')
const insertSql = `INSERT INTO articles (${columns.join(',')}) VALUES (${placeholders})
  ON CONFLICT(feedId, identityKey) DO UPDATE SET ${updates}`

function validate(article: Article) {
  if (typeof article.title !== 'string' || typeof article.content !== 'string') throw new TypeError('Invalid article text')
  if (!Number.isSafeInteger(article.feedId) || article.feedId! < 1) throw new TypeError('Invalid article feed ID')
}

function filterSql(tab: ArticleFilter['tab']): { where: string; params: unknown[] } {
  if (typeof tab === 'number' && Number.isSafeInteger(tab) && tab > 0) return { where: 'WHERE feedId = ?', params: [tab] }
  if (tab === 'unread') return { where: 'WHERE read = 0', params: [] }
  if (tab === 'starred') return { where: 'WHERE starred = 1', params: [] }
  if (tab === 'all') return { where: '', params: [] }
  throw new TypeError('Invalid article filter')
}

export function createArticleRepository(db: DatabaseClient) {
  const getById = async (id: number): Promise<Article | null> => (await db.get<Article>('SELECT * FROM articles WHERE id = ?', id)) ?? null

  const upsert = async (input: Article | Article[]) => {
    const items = Array.isArray(input) ? input : [input]
    if (!items.length) return
    items.forEach(validate)
    await db.transaction(async () => {
      const feedIds = [...new Set(items.map((article) => article.feedId!))]
      const legacy = await db.all<Article>(
        `SELECT id, feedId, url FROM articles
        WHERE identityKey LIKE 'legacy:%' AND feedId IN (${feedIds.map(() => '?').join(',')})`,
        ...feedIds,
      )
      const byUrl = new Map(
        legacy
          .filter((article) => httpUrl(article.url))
          .map((article) => [`${article.feedId}:${httpUrl(article.url)}`, article.id!]),
      )
      for (const source of items) {
        const article = { ...source, url: httpUrl(source.url) ?? '', identityKey: articleIdentity(source) }
        const legacyId = byUrl.get(`${article.feedId}:${article.url}`)
        if (legacyId !== undefined) {
          // eslint-disable-next-line no-await-in-loop -- Adopt legacy rows within the same ordered transaction.
          await db.run(
            `UPDATE articles SET identityKey = ? WHERE id = ? AND NOT EXISTS
            (SELECT 1 FROM articles WHERE feedId = ? AND identityKey = ?)`,
            article.identityKey,
            legacyId,
            article.feedId,
            article.identityKey,
          )
          byUrl.delete(`${article.feedId}:${article.url}`)
        }
        // eslint-disable-next-line no-await-in-loop -- Preserve backpressure and ordered processing.
        await db.run(insertSql, ...columns.map((name) => article[name] ?? null))
      }
    })
  }

  const find = async ({ tab, page = 1, size = 50 }: ArticleFilter) => {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 500) {
      throw new RangeError('Invalid article pagination')
    }
    const { where, params } = filterSql(tab)
    return db.transaction(async () => {
      const count = await db.get<{ count: number }>(
        `SELECT count(*) AS count FROM articles ${where}`,
        ...params,
      )
      const rows = await db.all<Article>(
        `SELECT * FROM articles ${where} ORDER BY createTime DESC, id DESC LIMIT ? OFFSET ?`,
        ...params,
        size,
        (page - 1) * size,
      )
      return { count: count!.count, rows }
    })
  }

  const starred = (id: number, status: 0 | 1) => db.run('UPDATE articles SET starred = ? WHERE id = ?', status, id)
  const markRead = (ids: number[], status: 0 | 1) => {
    if (!ids.length) return Promise.resolve()
    return db.run(
      `UPDATE articles SET read = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      status,
      ...ids,
    )
  }
  return {
    getById,
    upsert,
    find,
    starred,
    markRead,
  }
}
