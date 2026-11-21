import {
  QueryClient, queryOptions, useMutation, useQueryClient,
} from '@tanstack/react-query'
import * as feedService from '@/services/reader/browser/feed'
import * as articleService from '@/services/reader/browser/article'
import { useReaderStore } from '@/ui/store/reader'
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
export const articlesOptions = (filter: ArticleFilter, unreadVersion: number) => queryOptions({
  queryKey: [...readerKeys.articles, filter, filter.tab === 'unread' ? unreadVersion : null] as const,
  queryFn: () => {
    const state = useReaderStore.getState()
    const retaining = filter.tab === 'unread' && state.unreadVersion === unreadVersion
    return articleService.find(retaining ? { ...filter, retainedUnreadIds: [...state.retainedUnreadIds] } : filter)
  },
  placeholderData: (previous, query) => {
    const previousFilter = query?.queryKey[2]
    if (previousFilter?.tab !== filter.tab) return undefined
    return previousFilter.page === filter.page && previousFilter.size === filter.size ? previous : undefined
  },
})

// Patch successful writes into cached reading pages before invalidating them.
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

export function useFeedTransfer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: feedService.transfer,
    meta: { inlineError: true },
    onSuccess: (result) => {
      if ('status' in result && result.status === 'imported') {
        return client.invalidateQueries({ queryKey: readerKeys.all })
      }
      return undefined
    },
  })
}

export function useRefreshFeeds() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: feedService.refreshAll,
    meta: { inlineError: true },
    onSuccess: () => client.invalidateQueries({ queryKey: readerKeys.all }),
  })
}

export function useDeleteFeed(onDeleted: (id: number) => void) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: feedService.deleteById,
    meta: { inlineError: true },
    onSuccess: (_, id) => {
      onDeleted(id)
      return client.invalidateQueries({ queryKey: readerKeys.all })
    },
  })
}

export function useMarkRead() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [writeScope],
    scope: { id: writeScope },
    mutationFn: ({ ids, status }: { ids: number[]; status: 0 | 1; unreadVersion: number }) => (
      articleService.markRead(ids, status)
    ),
    onMutate: ({ ids, status, unreadVersion }) => {
      const state = useReaderStore.getState()
      // Reserve these rows before writing so an overlapping list fetch can still include them.
      if (status === 1 && state.unreadVersion === unreadVersion) state.retainUnread(ids)
    },
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
