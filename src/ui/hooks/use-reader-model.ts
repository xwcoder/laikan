import { useEffect, useRef, useState } from 'react'
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { normalizeReaderFontSize, readerFontSize } from '@/base/common/reader-font-size'
import { ArticleListItem, ArticlePage } from '@/types/reader'
import { useReaderStore } from '@/ui/store/reader'
import {
  articleOptions,
  articlesOptions,
  feedsOptions,
  unreadCountOptions,
  useMarkFeedRead,
  useMarkRead,
  useRefreshFeeds,
  useStarArticle,
  useUnsubscribe,
} from '@/ui/query/reader'
import { settingsOptions, useSettings, useUpdateSettings } from '@/ui/query/settings'

type ReaderState = ReturnType<typeof useReaderStore.getState>
const emptyArticles: ArticleListItem[] = []

function useSelectionSync(state: ReaderState, result: ArticlePage | undefined) {
  const {
    opened, tabVisit, page, size,
  } = state
  useEffect(() => {
    if (opened || !result) return
    const current = useReaderStore.getState()
    if (current.opened || current.tabVisit !== tabVisit || current.page !== page) return
    const lastPage = Math.max(1, Math.ceil(result.count / size))
    if (page > lastPage) {
      current.changePage(lastPage)
      return
    }
    const ids = result.data.map((article) => article.id!)
    if (!ids.includes(current.activeId!)) current.activate(ids[0] ?? null)
    const selected = current.selectedIds.filter((id) => ids.includes(id))
    if (selected.length !== current.selectedIds.length) current.select(selected)
  }, [result, opened, tabVisit, page, size])
}

async function getPageTarget(client: QueryClient, state: ReaderState, result: ArticlePage, direction: 1 | -1) {
  const {
    tab, page, size, unreadVersion, libraryRevision,
  } = state
  const hasUnstarred = tab === 'starred' && result.data.some((article) => article.starred === 0)
  const nextPage = direction === 1 && hasUnstarred ? page : page + direction
  if (nextPage < 1 || nextPage > Math.ceil(result.count / size)) return null
  const next = await client.fetchQuery(articlesOptions({ tab, page: nextPage, size }, unreadVersion, libraryRevision))
    .catch((error) => {
      if (useReaderStore.getState().libraryRevision !== libraryRevision) return undefined
      throw error
    })
  if (!next) return null
  return { page: nextPage, article: direction === 1 ? next.data[0] : next.data.at(-1) }
}

function useNavigation(state: ReaderState, result: ArticlePage | undefined, fetching: boolean) {
  const client = useQueryClient()
  const focusRequest = useRef<number | null>(null)
  const move = async (direction: 1 | -1) => {
    if (fetching || !result?.data.length) return
    const current = useReaderStore.getState()
    if (current.tab !== state.tab || current.page !== state.page) return
    const index = result.data.findIndex((article) => article.id === current.activeId)
    const article = result.data[index + direction]
    const next = article ? { page: current.page, article } : await getPageTarget(client, current, result, direction)
    // A page request can finish after focus or the current view has already changed.
    if (!next?.article || useReaderStore.getState() !== current) return
    const id = next.article.id!
    if (!current.opened) focusRequest.current = id
    if (next.page === current.page) current.activate(id)
    else current.changePage(next.page, id)
  }
  return { move, focusRequest }
}

function getReadTargets(state: ReaderState, articles: ArticleListItem[], activeArticle?: ArticleListItem | null) {
  if (state.opened) return activeArticle ? [activeArticle] : []
  return articles.filter((article) => state.selectedIds.includes(article.id!))
}

function useArticleActions(
  state: ReaderState,
  articles: ArticleListItem[],
  activeArticle?: ArticleListItem | null,
) {
  const readMutation = useMarkRead()
  const starMutation = useStarArticle()
  const selectedIds = state.opened && state.activeId !== null ? [state.activeId] : state.selectedIds
  const markRead = (status: 0 | 1, ids = selectedIds) => {
    if (ids.length) readMutation.mutate({ ids, status, unreadVersion: state.unreadVersion })
  }
  const toggleRead = () => {
    const targets = getReadTargets(state, articles, activeArticle)
    markRead(targets.some((a) => !a.read) ? 1 : 0)
  }
  const toggleStar = (id = state.activeId) => {
    const article = state.opened ? activeArticle : articles.find((a) => a.id === id)
    if (id === null || !article || starMutation.isPending) return
    starMutation.mutate({ id, status: article.starred ? 0 : 1 })
  }
  return {
    markRead, toggleRead, toggleStar, writing: readMutation.isPending || starMutation.isPending,
  }
}

function leaveUnsubscribedFeed(id: number) {
  const current = useReaderStore.getState()
  if (current.tab !== id) return
  current.changeTab('all')
  if (current.opened && current.activeId !== null) current.open(current.activeId)
}

function useReaderFontSize(client: QueryClient) {
  const settings = useSettings()
  const { mutate } = useUpdateSettings()
  const [pending, setPending] = useState<{ value: number } | null>(null)
  const fontSize = pending?.value ?? normalizeReaderFontSize(settings.data?.reader?.fontSize)

  useEffect(() => {
    if (!pending) return undefined
    const timeout = window.setTimeout(() => {
      mutate({ path: 'reader.fontSize', value: pending.value }, {
        // An earlier save may finish after the reader has already chosen another size.
        onSettled: () => setPending((current) => (current === pending ? null : current)),
      })
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [mutate, pending])

  const changeFont = (direction: 1 | -1) => {
    const saved = normalizeReaderFontSize(client.getQueryData(settingsOptions.queryKey)?.reader?.fontSize)
    setPending((current) => {
      const previous = current?.value ?? saved
      const value = normalizeReaderFontSize(previous + direction * readerFontSize.step)
      return value === previous ? current : { value }
    })
  }

  return { fontSize, changeFont }
}

export function useReaderModel() {
  const state = useReaderStore()
  const client = useQueryClient()
  const {
    tab, page, size, activeId, opened, unreadVersion, libraryRevision,
  } = state
  const feeds = useQuery(feedsOptions(libraryRevision))
  const unreadCount = useQuery(unreadCountOptions(libraryRevision)).data ?? 0
  const listOptions = articlesOptions({ tab, page, size }, unreadVersion, libraryRevision)
  // Keep the current reading sequence stable while read/star writes change list membership.
  // Re-enable stale list fetching on return, or populate a page whose cache has expired.
  const list = useQuery({
    ...listOptions,
    enabled: !opened || !client.getQueryData(listOptions.queryKey),
  })
  const detail = useQuery({ ...articleOptions(activeId, libraryRevision), enabled: opened && activeId !== null })
  const font = useReaderFontSize(client)
  const refresh = useRefreshFeeds()
  const markFeedRead = useMarkFeedRead()
  const unsubscribe = useUnsubscribe(leaveUnsubscribedFeed)
  const articles = list.data?.data ?? emptyArticles
  const activeArticle = opened ? detail.data : articles.find((article) => article.id === activeId)
  const actions = useArticleActions(state, articles, activeArticle)
  const writing = actions.writing || markFeedRead.isPending
  const navigation = useNavigation(state, list.data, list.isFetching || writing)
  useSelectionSync(state, list.isPlaceholderData ? undefined : list.data)

  const refreshList = () => {
    if (refresh.isPending) return
    if (tab === 'unread') state.resetUnreadView()
    refresh.mutate()
  }
  return {
    ...state,
    ...navigation,
    ...actions,
    writing,
    ...font,
    feeds,
    unreadCount,
    list,
    detail,
    articles,
    activeArticle,
    count: list.data?.count ?? 0,
    refresh,
    refreshList,
    unsubscribe,
    markFeedRead,
  }
}

export type ReaderModel = ReturnType<typeof useReaderModel>
