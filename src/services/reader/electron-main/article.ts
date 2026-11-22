import database, { getLibraryRevision } from '@/services/db/electron-main/db'
import { httpUrl } from '@/base/common/url'
import { fetchFullText } from '@/base/node/full-text'
import { ArticleFullText } from '@/types/reader'
import { createArticleRepository } from './article-repository'
import { extractArticle } from './extract-article'

const repository = createArticleRepository(database)
export const {
  getById, upsert, find, countUnread, starred, markRead,
} = repository
const requests = new Map<string, Promise<ArticleFullText>>()

async function extractAndCache(id: number, url: string, direct: boolean) {
  const content = await fetchFullText(url, extractArticle, direct)
  if (!await repository.saveFullText(id, url, content)) throw new Error('Article source changed during extraction')
  return content
}

export async function loadFullText(id: number): Promise<ArticleFullText> {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Invalid article ID')
  const article = await getById(id)
  const url = httpUrl(article?.contentUrl || article?.url)
  if (!article || !url) throw new Error('No original article address')
  if (article.fullText) return article.fullText
  const key = JSON.stringify([getLibraryRevision(), id, url])
  const existing = requests.get(key)
  if (existing) return existing
  const pending = extractAndCache(id, url, !!article.contentUrl).finally(() => requests.delete(key))
  requests.set(key, pending)
  return pending
}
