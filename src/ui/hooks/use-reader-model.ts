import { useEffect } from 'react'
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArticleListItem, ArticlePage, Tab } from '@/types/reader'
import { useReaderStore } from '@/ui/store/reader'
import {
  articleOptions,
  articlesOptions,
  feedsOptions,
  readerKeys,
  useDeleteFeed,
  useMarkRead,
  useStarArticle,
} from '@/ui/query/reader'
import { useSettings, useUpdateSettings } from '@/ui/query/settings'

type ReaderState = ReturnType<typeof useReaderStore.getState>

function useSelectionSync(state: ReaderState, result: ArticlePage | undefined) {
  const {
    opened, activeId, selectedIds, page, size,
  } = state
  useEffect(() => {
    if (opened || !result) return
    const ids = result.data.map((article) => article.id!)
    if (!ids.includes(activeId!)) state.activate(ids[0] ?? null)
    const selected = selectedIds.filter((id) => ids.includes(id))
    if (selected.length !== selectedIds.length) state.select(selected)
    const lastPage = Math.max(1, Math.ceil(result.count / size))
    if (page > lastPage) state.changePage(lastPage)
  }, [result, opened, activeId, page, size, selectedIds])
}

const hasFilteredArticles = (tab: Tab | number, articles: ArticleListItem[]) => (
  (tab === 'unread' && articles.some((article) => article.read === 1))
  || (tab === 'starred' && articles.some((article) => article.starred === 0))
)

async function movePage(client: QueryClient, state: ReaderState, result: ArticlePage, direction: 1 | -1) {
  const { tab, page, size } = state
  const nextPage = direction === 1 && hasFilteredArticles(tab, result.data) ? page : page + direction
  if (nextPage < 1 || nextPage > Math.ceil(result.count / size)) return
  const next = await client.fetchQuery(articlesOptions({ tab, page: nextPage, size }))
  const current = useReaderStore.getState()
  // Ignore navigation that completed after switching views or closing the article.
  if (current.tab !== tab || current.page !== page || current.opened !== state.opened) return
  if (!next.data.length) return
  state.changePage(nextPage)
  state.activate((direction === 1 ? next.data[0] : next.data[next.data.length - 1]).id!)
}

function useNavigation(state: ReaderState, result: ArticlePage | undefined, fetching: boolean) {
  const client = useQueryClient()
  const refresh = () => {
    state.fold()
    state.select([])
    if (state.page !== 1) state.changePage(1)
    client.invalidateQueries({ queryKey: readerKeys.all })
  }
  const move = async (direction: 1 | -1) => {
    if (fetching || !result?.data.length) return
    const index = result.data.findIndex((article) => article.id === state.activeId)
    const next = index + direction
    if (next >= 0 && next < result.data.length) state.activate(result.data[next].id!)
    else await movePage(client, state, result, direction)
  }
  return { refresh, move }
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
    if (ids.length) readMutation.mutate({ ids, status })
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

export function useReaderModel() {
  const state = useReaderStore()
  const client = useQueryClient()
  const {
    tab, page, size, activeId, opened,
  } = state
  const feeds = useQuery(feedsOptions)
  const listOptions = articlesOptions({ tab, page, size })
  // Keep the current reading sequence stable while read/star writes change list membership.
  // Re-enable stale list fetching on return, or populate a page whose cache has expired.
  const list = useQuery({
    ...listOptions,
    enabled: !opened || !client.getQueryData(listOptions.queryKey),
  })
  const detail = useQuery({ ...articleOptions(activeId), enabled: opened && activeId !== null })
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
  const deleteMutation = useDeleteFeed()
  const articles = list.data?.data ?? []
  const activeArticle = opened ? detail.data : articles.find((article) => article.id === activeId)
  const fontSize = Math.max(12, Math.min(24, settings.data?.reader?.fontSize ?? 14))
  const actions = useArticleActions(state, articles, activeArticle)
  const navigation = useNavigation(state, list.data, list.isFetching || actions.writing)
  useSelectionSync(state, list.data)

  const deleteFeed = (id: number) => deleteMutation.mutate(id, {
    onSuccess: () => {
      if (useReaderStore.getState().tab === id) state.changeTab('all')
      else navigation.refresh()
    },
  })
  const changeFont = (delta: number) => updateSettings.mutate({
    path: 'reader.fontSize',
    value: Math.max(12, Math.min(24, fontSize + delta)),
  })

  return {
    ...state,
    ...navigation,
    ...actions,
    feeds,
    list,
    detail,
    articles,
    activeArticle,
    fontSize,
    count: list.data?.count ?? 0,
    deleteFeed,
    changeFont,
    deleting: deleteMutation.isPending,
    updatingFont: updateSettings.isPending,
  }
}

export type ReaderModel = ReturnType<typeof useReaderModel>
