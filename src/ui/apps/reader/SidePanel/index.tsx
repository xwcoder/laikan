import {
  Inbox, Star, Newspaper, Rss, Copy, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Tab } from '@/types/reader'
import { Button } from '@/ui/components/ui/button'
import { Separator } from '@/ui/components/ui/separator'
import { IconButton } from '@/ui/components/icon-button'
import { AsyncState } from '@/ui/components/async-state'
import { cn } from '@/ui/lib/utils'
import AddButton from './Toolbar/add-btn'

export default function SidePanel({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null)
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
    <div className="flex min-h-full flex-col gap-4">
      <div className="space-y-1">
        {tabs.map(({ tab, Icon }) => (
          <Button
            key={tab}
            variant="ghost"
            data-tab={tab}
            aria-pressed={model.tab === tab}
            className={cn('w-full justify-start', model.tab === tab && 'bg-accent text-primary')}
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
      <Separator />
      <div className="flex items-center justify-between pl-2">
        <h2 className="text-xs font-medium text-muted-foreground">{t('reader.list.feeds')}</h2>
        <AddButton />
      </div>
      <div className="space-y-1">
        {model.feeds.isPending || model.feeds.isError ? (
          <AsyncState error={model.feeds.isError} retry={() => model.feeds.refetch()} />
        ) : model.feeds.data.length ? (
          model.feeds.data.map((feed) => (
            <div key={feed.id} className="group relative flex items-center" data-feed-id={feed.id}>
              <Button
                variant="ghost"
                aria-pressed={model.tab === feed.id}
                className={cn(
                  'w-full justify-start pr-4 group-focus-within:pr-16 group-hover:pr-16',
                  model.tab === feed.id && 'bg-accent text-primary',
                )}
                onClick={() => model.changeTab(feed.id!)}
              >
                <Rss className="shrink-0 text-muted-foreground" />
                <span className={cn('truncate', !!feed.unreadCount && 'font-semibold')}>{feed.title}</span>
                {!!feed.unreadCount && (
                  <span className="ml-auto text-xs tabular-nums group-focus-within:hidden group-hover:hidden">
                    {feed.unreadCount}
                  </span>
                )}
              </Button>
              <div className="absolute right-0 flex rounded-md bg-accent opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                <IconButton
                  label={t('reader.action.copy.title')}
                  className="size-7"
                  onClick={() => copy(feed.url)}
                >
                  <Copy />
                </IconButton>
                <IconButton
                  label={t('reader.action.delete')}
                  className="size-7"
                  disabled={model.deleting}
                  onClick={() => model.deleteFeed(feed.id!)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </div>
          ))
        ) : (
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">{t('reader.list.noFeeds')}</p>
        )}
      </div>
      <p role="status" className="px-2 text-xs text-muted-foreground">
        {copyStatus && t(copyStatus === 'success' ? 'reader.action.copy.success' : 'reader.action.copyError')}
      </p>
    </div>
  )
}
