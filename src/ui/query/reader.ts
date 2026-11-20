import {
  QueryClient, queryOptions, useMutation, useQueryClient,
} from '@tanstack/react-query'
import * as feedService from '@/services/reader/browser/feed'
import * as articleService from '@/services/reader/browser/article'
import {
  ArticleDetail, ArticleFilter, ArticleListItem, ArticlePage,
} from '@/types/reader'

const writeScope = 'reader-write'

export const readerKeys = {
  all: ['reader'] as const,
  feeds: ['reader', 'feeds'] as const,
  articles: ['reader', 'articles'] as const,
  details: ['reader', 'article'] as const,
  article: (id: number | null) => ['reader', 'article', id] as const,
}

export const feedsOptions = queryOptions({ queryKey: readerKeys.feeds, queryFn: feedService.getAll })
export const articlesOptions = (filter: ArticleFilter) => queryOptions({
  queryKey: [...readerKeys.articles, filter],
  queryFn: () => articleService.find(filter),
})

// Patch successful writes into cached reading pages before invalidating them.
// An open article keeps its navigation page until the reader returns to the list.
function updateArticles(client: QueryClient, ids: number[], patch: Pick<Partial<ArticleListItem>, 'read' | 'starred'>) {
  const update = <T extends ArticleListItem>(article: T): T => (
    ids.includes(article.id!) ? { ...article, ...patch } : article
  )
  client.setQueriesData<ArticlePage>({ queryKey: readerKeys.articles }, (page) => (
    page ? { ...page, data: page.data.map(update) } : page
  ))
  client.setQueriesData<ArticleDetail | null>({ queryKey: readerKeys.details }, (article) => (
    article ? update(article) : article
  ))
  return client.invalidateQueries({ queryKey: readerKeys.all })
}
export const articleOptions = (id: number | null) => queryOptions({
  queryKey: readerKeys.article(id),
  queryFn: () => (id === null ? null : articleService.getById(id)),
  enabled: id !== null,
})

export function useLoadFullText() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: articleService.loadFullText,
    onSuccess: (content, id) => (content ? client.invalidateQueries({ queryKey: readerKeys.article(id) }) : undefined),
  })
}
export const preflightOptions = (url: string) => queryOptions({
  queryKey: ['feed-preflight', url],
  queryFn: () => feedService.preflight(url),
  retry: false,
  staleTime: 60_000,
})

export function useSubscribe() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: feedService.upsert,
    onSuccess: () => client.invalidateQueries({ queryKey: readerKeys.all }),
  })
}

export function useDeleteFeed() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: feedService.deleteById,
    onSuccess: () => client.invalidateQueries({ queryKey: readerKeys.all }),
  })
}

export function useMarkRead() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [writeScope],
    scope: { id: writeScope },
    mutationFn: ({ ids, status }: { ids: number[]; status: 0 | 1 }) => articleService.markRead(ids, status),
    onSuccess: (_, { ids, status }) => updateArticles(client, ids, { read: status }),
  })
}

export function useStarArticle() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [writeScope],
    scope: { id: writeScope },
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => articleService.starred(id, status),
    onSuccess: (_, { id, status }) => updateArticles(client, [id], { starred: status }),
  })
}
