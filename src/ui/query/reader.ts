import {
  QueryClient, queryOptions, useMutation, useMutationState, useQueryClient,
} from '@tanstack/react-query'
import { feedUrlKey } from '@/base/common/feed-url'
import * as feedService from '@/services/reader/browser/feed'
import * as articleService from '@/services/reader/browser/article'
import { useReaderStore } from '@/ui/store/reader'
import {
  ArticleDetail, ArticleFilter, ArticleListItem, ArticlePage, Feed, FeedTransferAction,
} from '@/types/reader'

export const readerKeys = (revision: number) => {
  const all = ['reader', revision] as const
  return {
    all,
    feeds: [...all, 'feeds'] as const,
    subscribe: [...all, 'subscribe'] as const,
    unreadCount: [...all, 'unread-count'] as const,
    articles: [...all, 'articles'] as const,
    details: [...all, 'article'] as const,
    article: (id: number | null) => [...all, 'article', id] as const,
  }
}

export const feedsOptions = (revision: number) => queryOptions({
  queryKey: readerKeys(revision).feeds,
  networkMode: 'always',
  queryFn: () => feedService.getAll(revision),
})
export const unreadCountOptions = (revision: number) => queryOptions({
  queryKey: readerKeys(revision).unreadCount,
  networkMode: 'always',
  queryFn: () => articleService.countUnread(revision),
})
export const articlesOptions = (filter: ArticleFilter, unreadVersion: number, revision: number) => queryOptions({
  queryKey: [...readerKeys(revision).articles, filter, filter.tab === 'unread' ? unreadVersion : null] as const,
  networkMode: 'always',
  queryFn: () => {
    const state = useReaderStore.getState()
    const retaining = filter.tab === 'unread' && state.unreadVersion === unreadVersion
    const params = retaining ? { ...filter, retainedUnreadIds: [...state.retainedUnreadIds] } : filter
    return articleService.find(params, revision)
  },
  placeholderData: (previous, query) => {
    if (query?.queryKey[1] !== revision) return undefined
    const previousFilter = query.queryKey[3]
    if (previousFilter.tab !== filter.tab) return undefined
    return previousFilter.page === filter.page && previousFilter.size === filter.size ? previous : undefined
  },
})

// Patch successful writes into cached reading pages before invalidating them.
function updateArticles(
  client: QueryClient,
  revision: number,
  ids: number[],
  patch: Pick<Partial<ArticleListItem>, 'read' | 'starred'>,
) {
  const keys = readerKeys(revision)
  const targets = new Set(ids)
  const update = <T extends ArticleListItem>(article: T): T => (
    targets.has(article.id!) ? { ...article, ...patch } : article
  )
  client.setQueriesData<ArticlePage>({ queryKey: keys.articles }, (page) => (
    page ? { ...page, data: page.data.map(update) } : page
  ))
  client.setQueriesData<ArticleDetail | null>({ queryKey: keys.details }, (article) => (
    article ? update(article) : article
  ))
  return client.invalidateQueries({ queryKey: keys.all })
}
export const articleOptions = (id: number | null, revision: number) => queryOptions({
  queryKey: readerKeys(revision).article(id),
  networkMode: 'always',
  queryFn: () => (id === null ? null : articleService.getById(id, revision)),
  enabled: id !== null,
})

export function useLoadFullText() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  return useMutation({
    mutationFn: (id: number) => articleService.loadFullText(id, revision),
    onSuccess: (content, id) => {
      if (content) return client.invalidateQueries({ queryKey: readerKeys(revision).article(id) })
      return undefined
    },
  })
}
export const preflightOptions = (url: string) => queryOptions({
  queryKey: ['feed-preflight', url],
  queryFn: () => feedService.preflight(url),
  retry: false,
  staleTime: 60_000,
})

type Subscription = Pick<Feed, 'url' | 'title'>

export function useSubscribe(inlineError = false) {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  const keys = readerKeys(revision)
  return useMutation({
    mutationKey: keys.subscribe,
    scope: { id: 'reader-subscribe' },
    networkMode: 'always',
    mutationFn: async (data: Subscription) => {
      if (revision === useReaderStore.getState().libraryRevision) await feedService.upsert(data, revision)
    },
    meta: { inlineError, libraryRevision: revision },
    onSuccess: () => {
      if (revision === useReaderStore.getState().libraryRevision) {
        return client.invalidateQueries({ queryKey: keys.all })
      }
      return undefined
    },
  })
}

export function useRecommendedSubscriptions() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  const mutationKey = readerKeys(revision).subscribe
  const { mutate } = useSubscribe(true)
  const attempts = useMutationState({
    filters: { mutationKey },
    select: ({ state, meta }) => {
      const data = state.variables as Subscription | undefined
      if (!data) return undefined
      return [feedUrlKey(data.url), {
        pending: state.status === 'pending',
        error: meta?.inlineError ? state.error : null,
      }] as const
    },
  })

  const subscribe = (data: Subscription) => {
    const url = feedUrlKey(data.url)
    // Check the cache immediately so repeated clicks before a render cannot enqueue duplicates.
    if (!client.isMutating({
      mutationKey,
      predicate: ({ state }) => feedUrlKey((state.variables as Subscription).url) === url,
    })) mutate(data)
  }

  return { subscribe, attempts: new Map(attempts.filter((attempt) => attempt !== undefined)) }
}

export function useFeedTransfer() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  return useMutation({
    mutationFn: (action: FeedTransferAction) => feedService.transfer(action, revision),
    meta: { inlineError: true },
    onSuccess: (result) => {
      if ('status' in result && result.status === 'imported') {
        return client.invalidateQueries({ queryKey: readerKeys(revision).all })
      }
      return undefined
    },
  })
}

export function useRefreshFeeds() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  const keys = readerKeys(revision)
  return useMutation({
    mutationKey: [...keys.all, 'refresh'],
    mutationFn: () => feedService.refreshAll(revision),
    meta: { inlineError: true },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUnsubscribe(onUnsubscribed: (id: number) => void) {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  const keys = readerKeys(revision)
  return useMutation({
    mutationKey: [...keys.all, 'unsubscribe'],
    mutationFn: (id: number) => feedService.unsubscribe(id, revision),
    meta: { inlineError: true },
    onSuccess: (_, id) => {
      if (revision !== useReaderStore.getState().libraryRevision) return
      onUnsubscribed(id)
      client.setQueryData<Feed[]>(keys.feeds, (feeds) => feeds?.filter((feed) => feed.id !== id))
      client.invalidateQueries({ queryKey: keys.all })
    },
  })
}

export function useMarkRead() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  return useMutation({
    mutationKey: [...readerKeys(revision).all, 'read'],
    scope: { id: `reader-write:${revision}` },
    meta: { libraryRevision: revision },
    mutationFn: ({ ids, status }: { ids: number[]; status: 0 | 1; unreadVersion: number }) => (
      articleService.markRead(ids, status, revision)
    ),
    onMutate: ({ ids, status, unreadVersion }) => {
      const state = useReaderStore.getState()
      // Reserve these rows before writing so an overlapping list fetch can still include them.
      if (status === 1 && state.unreadVersion === unreadVersion) state.retainUnread(ids)
    },
    onSuccess: (_, { ids, status }) => updateArticles(client, revision, ids, { read: status }),
  })
}

export function useMarkFeedRead() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  return useMutation({
    mutationKey: [...readerKeys(revision).all, 'feed-read'],
    scope: { id: `reader-write:${revision}` },
    meta: { inlineError: true, libraryRevision: revision },
    mutationFn: (id: number) => articleService.markFeedRead(id, revision),
    onSuccess: (ids) => {
      const state = useReaderStore.getState()
      if (revision !== state.libraryRevision) return undefined
      state.forgetUnread(ids)
      return updateArticles(client, revision, ids, { read: 1 })
    },
  })
}

export function useStarArticle() {
  const client = useQueryClient()
  const revision = useReaderStore((state) => state.libraryRevision)
  return useMutation({
    mutationKey: [...readerKeys(revision).all, 'star'],
    scope: { id: `reader-write:${revision}` },
    meta: { libraryRevision: revision },
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => articleService.starred(id, status, revision),
    onSuccess: (_, { id, status }) => updateArticles(client, revision, [id], { starred: status }),
  })
}
