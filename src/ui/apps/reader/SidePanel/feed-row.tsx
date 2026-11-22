import {
  Check, Copy, Minus, Rss,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Feed } from '@/types/reader'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Button } from '@/ui/components/ui/button'
import { cn } from '@/ui/lib/utils'

export type FeedRow = {
  feed: Feed
  phase: 'active' | 'pending' | 'confirmed' | 'leaving'
}

function SidebarFeedIcon({ icon }: Pick<Feed, 'icon'>) {
  return icon
    ? <img src={icon} alt="" className="size-4 shrink-0 rounded-sm object-contain" />
    : <Rss className="shrink-0 text-muted-foreground" />
}

type FeedActions = {
  onCopy: (url: string) => void
  onUnsubscribe: (id: number, trigger: HTMLButtonElement) => void
}

const actionsPosition = 'pointer-events-none absolute right-1 flex'

function SidebarFeedActions({
  row, busy, onCopy, onUnsubscribe,
}: FeedActions & { row: FeedRow; busy: boolean }) {
  const { t } = useTranslation()
  const { feed, phase } = row
  if (phase === 'confirmed') {
    return (
      <div
        data-feed-actions
        aria-hidden
        className={cn(actionsPosition, 'size-8 items-center justify-center text-theme-emphasis')}
      >
        <Check className="size-4" />
      </div>
    )
  }
  const pending = phase === 'pending'
  return (
    <div
      data-feed-actions
      className={cn(
        actionsPosition,
        'opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
        'has-focus-visible:pointer-events-auto has-focus-visible:opacity-100',
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('reader.action.copy.title')}
        className="hover:bg-background focus-visible:ring-inset dark:hover:bg-background"
        onClick={() => onCopy(feed.url)}
      >
        <Copy />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('reader.action.unsubscribe')}
        title={t('reader.action.unsubscribe')}
        className="hover:bg-background aria-disabled:opacity-50 focus-visible:ring-inset dark:hover:bg-background"
        aria-disabled={pending || busy}
        aria-busy={pending || undefined}
        onClick={(event) => onUnsubscribe(feed.id!, event.currentTarget)}
      >
        <Minus aria-hidden />
      </Button>
    </div>
  )
}

export default function SidebarFeedRow({
  row, model, onCopy, onUnsubscribe, onExit,
}: FeedActions & {
  row: FeedRow
  model: ReaderModel
  onExit: (id: number, phase: FeedRow['phase']) => void
}) {
  const { feed, phase } = row
  const id = feed.id!
  const confirmed = phase === 'confirmed'
  const leaving = confirmed || phase === 'leaving'

  useEffect(() => {
    if (!leaving) return undefined
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = (reducedMotion ? 0 : 220) + (confirmed ? 150 : 0)
    const timeout = window.setTimeout(() => onExit(id, phase), duration)
    return () => window.clearTimeout(timeout)
  }, [confirmed, id, leaving, onExit, phase])

  return (
    <div
      data-feed-leaving={leaving ? id : undefined}
      inert={leaving}
      aria-hidden={leaving}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
        leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
        confirmed && 'delay-150 motion-reduce:grid-rows-[1fr] motion-reduce:opacity-100',
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-feed-id={id}
          className={cn(
            'group relative mb-1 flex items-center rounded-md transition-colors',
            model.tab === id ? 'bg-sidebar-current' : 'hover:bg-sidebar-accent has-focus-visible:bg-sidebar-accent',
          )}
        >
          <Button
            variant="ghost"
            aria-pressed={model.tab === id}
            className={cn(
              'w-full justify-start px-2 hover:bg-transparent focus-visible:ring-inset dark:hover:bg-transparent',
              'aria-pressed:[&>svg]:text-theme-emphasis',
              confirmed ? 'pr-9' : 'group-hover:pr-16 group-has-[[data-feed-actions]_:focus-visible]:pr-16',
            )}
            onClick={() => model.changeTab(id)}
          >
            <SidebarFeedIcon icon={feed.icon} />
            <span className={cn('truncate', !!feed.unreadCount && 'font-semibold')}>{feed.title}</span>
            {!!feed.unreadCount && !confirmed && (
              <span className="ml-auto text-xs tabular-nums group-hover:hidden group-has-[[data-feed-actions]_:focus-visible]:hidden">
                {feed.unreadCount}
              </span>
            )}
          </Button>
          <SidebarFeedActions
            row={row}
            busy={model.unsubscribe.isPending}
            onCopy={onCopy}
            onUnsubscribe={onUnsubscribe}
          />
        </div>
      </div>
    </div>
  )
}
