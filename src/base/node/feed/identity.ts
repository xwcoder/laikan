import { createHash } from 'node:crypto'
import { Article } from '@/types/reader'
import { httpUrl } from '@/base/common/url'

export function articleIdentity(article: Article): string {
  if (article.externalId?.trim()) return `id:${article.externalId.trim()}`
  const url = httpUrl(article.url)
  if (url) return `url:${url}`
  const fingerprint = JSON.stringify([
    article.title,
    article.pubTime ?? '',
    article.author ?? '',
    article.content,
  ])
  return `hash:${createHash('sha256').update(fingerprint).digest('hex')}`
}
