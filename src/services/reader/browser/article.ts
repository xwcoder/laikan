import fetch from '@/base/browser/fetch'
import { Article, ArticleFilter, ArticlePage } from '@/types/reader'

export const find = (params: ArticleFilter): Promise<ArticlePage> => fetch('/reader/get/articles', params)
export const getById = (id: number): Promise<Article | null> => fetch('/reader/get/article', id)
export const starred = (id: number, status: 0 | 1): Promise<void> => fetch('/reader/put/article/starred', { id, status })
export const markRead = (ids: number[], status: 0 | 1): Promise<void> => fetch('/reader/put/article/read', { ids, status })
