import { DatabaseClient } from '@/base/node/database'
import { articleIdentity } from '@/base/node/feed/identity'
import { httpUrl } from '@/base/common/url'
import {
  Article, ArticleDetail, ArticleFilter, ArticleFullText, ArticleListItem,
} from '@/types/reader'

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
  'contentSource',
  'contentUrl',
] as const
const placeholders = columns.map(() => '?').join(',')
const bodyColumns = ['content', 'contentBase', 'contentSource']
const rank = (table: string) => `CASE
  WHEN trim(${table}.content) = '' OR ${table}.contentSource = 'empty' THEN 0
  WHEN ${table}.contentSource = 'media' THEN 1
  WHEN ${table}.contentSource = 'summary' THEN 2
  ELSE 3 END`
const updates = columns
  .filter((name) => name !== 'feedId' && name !== 'identityKey')
  .map((name) => (bodyColumns.includes(name)
    ? `${name}=CASE WHEN ${rank('excluded')} >= ${rank('articles')} THEN excluded.${name} ELSE articles.${name} END`
    : `${name}=excluded.${name}`))
  .join(',')
const insertSql = `INSERT INTO articles (${columns.join(',')}) VALUES (${placeholders})
  ON CONFLICT(feedId, identityKey) DO UPDATE SET ${updates}`
const fullTextSource = "COALESCE(NULLIF(articles.contentUrl, ''), articles.url)"
const listColumns = 'id, title, url, externalId, pubTime, author, read, starred, feedId'

function validate(article: Article) {
  if (typeof article.title !== 'string' || typeof article.content !== 'string') throw new TypeError('Invalid article text')
  if (!Number.isSafeInteger(article.feedId) || article.feedId! < 1) throw new TypeError('Invalid article feed ID')
}

function filterSql(tab: ArticleFilter['tab'], retainedUnreadIds: number[]): { where: string; params: unknown[] } {
  if (typeof tab === 'number' && Number.isSafeInteger(tab) && tab > 0) return { where: 'WHERE feedId = ?', params: [tab] }
  if (tab === 'unread') {
    if (!Array.isArray(retainedUnreadIds) || retainedUnreadIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new TypeError('Invalid retained article IDs')
    }
    if (retainedUnreadIds.length) {
      return {
        where: 'WHERE read = 0 OR id IN (SELECT value FROM json_each(?))',
        params: [JSON.stringify(retainedUnreadIds)],
      }
    }
    return { where: 'WHERE read = 0', params: [] }
  }
  if (tab === 'starred') return { where: 'WHERE starred = 1', params: [] }
  if (tab === 'all') return { where: '', params: [] }
  throw new TypeError('Invalid article filter')
}

export function createArticleRepository(db: DatabaseClient) {
  const getById = async (id: number): Promise<ArticleDetail | null> => {
    const row = await db.get<Article & { fullTextContent: string | null, fullTextBase: string | null }>(`
      SELECT articles.*, cached.content AS fullTextContent, cached.contentBase AS fullTextBase
      FROM articles LEFT JOIN article_full_text AS cached
        ON cached.articleId = articles.id AND cached.sourceUrl = ${fullTextSource}
      WHERE articles.id = ?`, id)
    if (!row) return null
    const { fullTextContent, fullTextBase, ...article } = row
    const fullText = fullTextContent && fullTextBase
      ? { content: fullTextContent, contentBase: fullTextBase }
      : undefined
    return { ...article, fullText }
  }

  const saveFullText = async (id: number, url: string, fullText: ArticleFullText) => {
    const { changes } = await db.run(
      `INSERT INTO article_full_text (articleId, sourceUrl, content, contentBase)
      SELECT id, ?, ?, ? FROM articles WHERE id = ? AND ${fullTextSource} = ?
      ON CONFLICT(articleId) DO UPDATE SET sourceUrl=excluded.sourceUrl,
        content=excluded.content, contentBase=excluded.contentBase`,
      url,
      fullText.content,
      fullText.contentBase,
      id,
      url,
    )
    return changes > 0
  }

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
        const article = {
          ...source,
          url: httpUrl(source.url) ?? '',
          contentUrl: httpUrl(source.contentUrl ?? undefined),
          contentSource: source.contentSource ?? (source.content.trim() ? 'full' : 'empty'),
          identityKey: articleIdentity(source),
        }
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

  const find = async ({
    tab, page = 1, size = 50, retainedUnreadIds = [],
  }: ArticleFilter) => {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 500) {
      throw new RangeError('Invalid article pagination')
    }
    const { where, params } = filterSql(tab, retainedUnreadIds)
    return db.transaction(async () => {
      const count = await db.get<{ count: number }>(
        `SELECT count(*) AS count FROM articles ${where}`,
        ...params,
      )
      const rows = await db.all<ArticleListItem>(
        `SELECT ${listColumns} FROM articles ${where} ORDER BY createTime DESC, id DESC LIMIT ? OFFSET ?`,
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
    saveFullText,
    upsert,
    find,
    starred,
    markRead,
  }
}
