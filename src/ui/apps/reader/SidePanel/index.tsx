import {
  Inbox, Star, Newspaper, Rss, Copy, Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Tab } from '@/types/reader'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'
import { AsyncState } from '@/ui/components/async-state'
import { cn } from '@/ui/lib/utils'
import FeedToolbar from './Toolbar'
import DeleteFeedDialog from './delete-feed-dialog'

export default function SidePanel({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, title: string } | null>(null)
  const deleteTrigger = useRef<HTMLButtonElement | null>(null)
  const allTab = useRef<HTMLButtonElement | null>(null)
  const unreadCount = model.feeds.data?.reduce((sum, feed) => sum + (feed.unreadCount ?? 0), 0) ?? 0
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
      <FeedToolbar hasFeeds={!!model.feeds.data?.length} />
      <div className="mt-1 space-y-1">
        {model.feeds.isPending || model.feeds.isError ? (
          <AsyncState error={model.feeds.isError} retry={() => model.feeds.refetch()} />
        ) : model.feeds.data.length ? (
          model.feeds.data.map((feed) => (
            <div
              key={feed.id}
              className={cn(
                'group relative flex items-center rounded-md transition-colors',
                model.tab === feed.id ? 'bg-sidebar-current' : 'hover:bg-sidebar-accent has-focus-visible:bg-sidebar-accent',
              )}
              data-feed-id={feed.id}
            >
              <Button
                variant="ghost"
                aria-pressed={model.tab === feed.id}
                className={cn(
                  'w-full justify-start px-2 hover:bg-transparent group-hover:pr-16 dark:hover:bg-transparent',
                  'group-has-[[data-feed-actions]_:focus-visible]:pr-16 aria-pressed:[&>svg]:text-theme-emphasis',
                )}
                onClick={() => model.changeTab(feed.id!)}
              >
                <Rss className="shrink-0 text-muted-foreground" />
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
                  className="hover:bg-background dark:hover:bg-background"
                  onClick={() => copy(feed.url)}
                >
                  <Copy />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('reader.action.delete')}
                  className="hover:bg-background dark:hover:bg-background"
                  disabled={model.deleting}
                  onClick={(event) => {
                    model.resetDelete()
                    deleteTrigger.current = event.currentTarget
                    setDeleteTarget({ id: feed.id!, title: feed.title || feed.url })
                  }}
                >
                  <Trash2 />
                </Button>
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
      <DeleteFeedDialog
        title={deleteTarget?.title ?? null}
        deleting={model.deleting}
        failed={model.deleteFailed}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          model.deleteFeed(deleteTarget.id, () => {
            deleteTrigger.current = null
            setDeleteTarget(null)
          })
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const trigger = deleteTrigger.current
          const target = trigger?.isConnected ? trigger : allTab.current
          target?.focus()
        }}
      />
    </div>
  )
}
