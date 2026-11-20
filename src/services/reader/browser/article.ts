import fetch from '@/base/browser/fetch'
import {
  ArticleDetail, ArticleFilter, ArticleFullText, ArticlePage,
} from '@/types/reader'

export const find = (params: ArticleFilter): Promise<ArticlePage> => fetch('/reader/get/articles', params)
export const getById = (id: number): Promise<ArticleDetail | null> => fetch('/reader/get/article', id)
export const loadFullText = (id: number): Promise<ArticleFullText | null> => fetch('/reader/post/article/full-text', id)
export const starred = (id: number, status: 0 | 1): Promise<void> => fetch('/reader/put/article/starred', { id, status })
export const markRead = (ids: number[], status: 0 | 1): Promise<void> => fetch('/reader/put/article/read', { ids, status })
