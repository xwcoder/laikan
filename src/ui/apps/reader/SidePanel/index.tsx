import {
  Inbox, Star, Newspaper, Rss, Copy, Minus, LoaderCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Feed, Tab } from '@/types/reader'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'
import { AsyncState } from '@/ui/components/async-state'
import { cn } from '@/ui/lib/utils'
import FeedToolbar from './Toolbar'

type FeedRow = { feed: Feed; leaving: boolean }

function SidebarFeedIcon({ icon }: Pick<Feed, 'icon'>) {
  return icon
    ? <img src={icon} alt="" className="size-4 shrink-0 rounded-sm object-contain" />
    : <Rss className="shrink-0 text-muted-foreground" />
}

function useFeedRows(feeds: Feed[] | undefined) {
  const [rows, setRows] = useState<FeedRow[]>([])

  useEffect(() => {
    if (!feeds) return undefined
    const activeIds = new Set(feeds.map((feed) => feed.id))
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setRows((current) => {
      const next = feeds.map((feed) => ({ feed, leaving: false }))
      if (!reducedMotion) {
        current.forEach((row, index) => {
          if (!activeIds.has(row.feed.id)) next.splice(index, 0, { ...row, leaving: true })
        })
      }
      return next
    })

    if (reducedMotion) return undefined
    const timeout = window.setTimeout(() => {
      setRows((current) => (current.some((row) => row.leaving) ? current.filter((row) => !row.leaving) : current))
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [feeds])

  return rows
}

export default function SidePanel({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null)
  const [unsubscribeFailed, setUnsubscribeFailed] = useState(false)
  const allTab = useRef<HTMLButtonElement | null>(null)
  const { unreadCount, unsubscribe } = model
  const rows = useFeedRows(model.feeds.data)
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

  const cancelSubscription = (id: number, trigger: HTMLButtonElement) => {
    if (unsubscribe.isPending) return
    const hadFocus = document.activeElement === trigger
    setUnsubscribeFailed(false)
    unsubscribe.mutate(id, {
      onError: () => setUnsubscribeFailed(true),
      onSuccess: () => {
        const focused = document.activeElement
        if (hadFocus && (focused === trigger || focused === document.body)) allTab.current?.focus()
      },
    })
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
        {model.feeds.isPending || model.feeds.isError ? (
          <AsyncState error={model.feeds.isError} retry={() => model.feeds.refetch()} />
        ) : rows.length ? (
          rows.map(({ feed, leaving }) => (
            <div
              key={feed.id}
              data-feed-leaving={leaving ? feed.id : undefined}
              inert={leaving}
              aria-hidden={leaving || undefined}
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
                leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  data-feed-id={feed.id}
                  className={cn(
                    'group relative mb-1 flex items-center rounded-md transition-colors',
                    model.tab === feed.id ? 'bg-sidebar-current' : 'hover:bg-sidebar-accent has-focus-visible:bg-sidebar-accent',
                  )}
                >
                  <Button
                    variant="ghost"
                    aria-pressed={model.tab === feed.id}
                    className={cn(
                      'w-full justify-start px-2 hover:bg-transparent focus-visible:ring-inset group-hover:pr-16 dark:hover:bg-transparent',
                      'group-has-[[data-feed-actions]_:focus-visible]:pr-16 aria-pressed:[&>svg]:text-theme-emphasis',
                    )}
                    onClick={() => model.changeTab(feed.id!)}
                  >
                    <SidebarFeedIcon icon={feed.icon} />
                    <span className={cn('truncate', !!feed.unreadCount && 'font-semibold')}>{feed.title}</span>
                    {!!feed.unreadCount && (
                    <span className="ml-auto text-xs tabular-nums group-hover:hidden group-has-[[data-feed-actions]_:focus-visible]:hidden">
                      {feed.unreadCount}
                    </span>
                    )}
                  </Button>
                  <div
                    data-feed-actions
                    className={cn(
                      'pointer-events-none absolute right-1 flex opacity-0',
                      'group-hover:pointer-events-auto group-hover:opacity-100',
                      'has-focus-visible:pointer-events-auto has-focus-visible:opacity-100',
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('reader.action.copy.title')}
                      className="hover:bg-background focus-visible:ring-inset dark:hover:bg-background"
                      onClick={() => copy(feed.url)}
                    >
                      <Copy />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('reader.action.unsubscribe')}
                      title={t('reader.action.unsubscribe')}
                      className="hover:bg-background aria-disabled:opacity-50 focus-visible:ring-inset dark:hover:bg-background"
                      aria-disabled={unsubscribe.isPending}
                      onClick={(event) => cancelSubscription(feed.id!, event.currentTarget)}
                    >
                      {unsubscribe.isPending && unsubscribe.variables === feed.id
                        ? <LoaderCircle aria-hidden className="animate-spin" />
                        : <Minus aria-hidden />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">{t('reader.list.noFeeds')}</p>
        )}
      </div>
      <p role="status" className="mt-3 px-2 text-xs text-muted-foreground empty:sr-only">
        {copyStatus && t(copyStatus === 'success' ? 'reader.action.copy.success' : 'reader.action.copyError')}
      </p>
      {unsubscribeFailed && <p role="alert" className="mt-2 px-2 text-xs text-destructive">{t('reader.unsubscribe.error')}</p>}
    </div>
  )
}
