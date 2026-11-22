import { Inbox, Star, Newspaper } from 'lucide-react'
import {
  useCallback, useEffect, useRef, useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Feed, Tab } from '@/types/reader'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'
import { AsyncState } from '@/ui/components/async-state'
import { cn } from '@/ui/lib/utils'
import FeedToolbar from './Toolbar'
import SidebarFeedRow, { FeedRow } from './feed-row'

function useFeedRows(feeds: Feed[] | undefined) {
  const [rows, setRows] = useState<FeedRow[]>([])

  useEffect(() => {
    if (!feeds) return
    const activeIds = new Set(feeds.map((feed) => feed.id))
    setRows((current) => {
      const previous = new Map(current.map(({ feed, phase }) => [feed.id, phase]))
      const next = feeds.map<FeedRow>((feed) => ({
        feed, phase: previous.get(feed.id) === 'pending' ? 'pending' : 'active',
      }))
      // Keep the pending row when a change notification arrives before the write response.
      current.forEach((row, index) => {
        if (!activeIds.has(row.feed.id)) {
          next.splice(index, 0, row.phase === 'active' ? { ...row, phase: 'leaving' } : row)
        }
      })
      return next
    })
  }, [feeds])

  const setPhase = (id: number, phase: FeedRow['phase']) => {
    setRows((current) => current.map((row) => (row.feed.id === id ? { ...row, phase } : row)))
  }
  const finishExit = useCallback((id: number, phase: FeedRow['phase']) => {
    setRows((current) => current.filter((row) => row.feed.id !== id || row.phase !== phase))
  }, [])

  return { rows, setPhase, finishExit }
}

export default function SidePanel({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null)
  const [unsubscribeFailed, setUnsubscribeFailed] = useState(false)
  const allTab = useRef<HTMLButtonElement | null>(null)
  const removing = useRef(false)
  const { unreadCount, unsubscribe } = model
  const { rows, setPhase, finishExit } = useFeedRows(model.feeds.data)
  const tabs = [
    { tab: 'unread', Icon: Inbox },
    { tab: 'starred', Icon: Star },
    { tab: 'all', Icon: Newspaper },
  ] as const

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
  }

  const cancelSubscription = async (id: number, trigger: HTMLButtonElement) => {
    if (removing.current || unsubscribe.isPending) return
    removing.current = true
    const hadFocus = document.activeElement === trigger
    setUnsubscribeFailed(false)
    setPhase(id, 'pending')
    try {
      await unsubscribe.mutateAsync(id)
    } catch {
      setPhase(id, 'active')
      setUnsubscribeFailed(true)
      return
    } finally {
      removing.current = false
    }

    const focused = document.activeElement
    if (hadFocus && (focused === trigger || focused === document.body)) allTab.current?.focus()
    setPhase(id, 'confirmed')
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-1">
        {tabs.map(({ tab, Icon }) => (
          <Button
            key={tab}
            ref={tab === 'all' ? allTab : undefined}
            variant="ghost"
            data-tab={tab}
            aria-pressed={model.tab === tab}
            className={cn(
              'w-full justify-start px-2 aria-pressed:font-semibold aria-pressed:text-sidebar-foreground',
              'aria-pressed:bg-sidebar-current aria-pressed:hover:bg-sidebar-current aria-pressed:[&>svg]:text-theme-emphasis',
            )}
            onClick={() => model.changeTab(tab as Tab)}
          >
            <Icon />
            {t(`reader.list.${tab}`)}
            {tab === 'unread' && unreadCount > 0 && (
              <span className="ml-auto text-xs tabular-nums">{unreadCount}</span>
            )}
          </Button>
        ))}
      </div>
      <Separator className="my-4 bg-sidebar-border" />
      <FeedToolbar model={model} />
      <div className="mt-1">
        {!model.feeds.data && (model.feeds.isPending || model.feeds.isError) ? (
          <AsyncState error={model.feeds.isError} retry={() => model.feeds.refetch()} />
        ) : rows.length ? (
          rows.map((row) => (
            <SidebarFeedRow
              key={row.feed.id}
              row={row}
              model={model}
              onCopy={copy}
              onUnsubscribe={cancelSubscription}
              onExit={finishExit}
            />
          ))
        ) : (
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">{t('reader.list.noFeeds')}</p>
        )}
      </div>
      <p role="status" className="mt-3 px-2 text-xs text-muted-foreground empty:sr-only">
        {copyStatus && t(copyStatus === 'success' ? 'reader.action.copy.success' : 'reader.action.copyError')}
      </p>
      <p role="status" className="sr-only">
        {rows.some((row) => row.phase === 'confirmed') && t('reader.unsubscribe.success')}
      </p>
      {unsubscribeFailed && (
        <p role="alert" className="mt-2 px-2 text-xs text-destructive">{t('reader.unsubscribe.error')}</p>
      )}
    </div>
  )
}
