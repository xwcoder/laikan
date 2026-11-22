import fetch from '@/base/browser/fetch'
import {
  ArticleDetail, ArticleFilter, ArticleFullText, ArticlePage,
} from '@/types/reader'

export const find = (params: ArticleFilter, revision: number): Promise<ArticlePage> => (
  fetch('/reader/get/articles', params, revision)
)
export const countUnread = (revision: number): Promise<number> => fetch('/reader/get/articles/unread-count', undefined, revision)
export const getById = (id: number, revision: number): Promise<ArticleDetail | null> => (
  fetch('/reader/get/article', id, revision)
)
export const loadFullText = (id: number, revision: number): Promise<ArticleFullText | null> => (
  fetch('/reader/post/article/full-text', id, revision)
)
export const starred = (id: number, status: 0 | 1, revision: number): Promise<void> => (
  fetch('/reader/put/article/starred', { id, status }, revision)
)
export const markRead = (ids: number[], status: 0 | 1, revision: number): Promise<void> => (
  fetch('/reader/put/article/read', { ids, status }, revision)
)
