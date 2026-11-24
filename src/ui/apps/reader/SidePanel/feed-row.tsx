import {
  Check, CheckCheck, Copy, Ellipsis, Minus, Rss,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DropdownMenu } from 'radix-ui'
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
  onCopy: (url: string) => Promise<boolean>
  onUnsubscribe: (id: number, trigger: HTMLButtonElement, focusVisible: boolean) => void
}

const actionsPosition = 'absolute right-1 flex items-center'
const menuItemClass = 'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm whitespace-nowrap outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0'

function SidebarFeedMenu({
  feed, busy, markFeedRead, onCopy, onUnsubscribe, onCloseAutoFocus,
}: {
  feed: Feed
  busy: boolean
  markFeedRead: ReaderModel['markFeedRead']
  onCopy: () => Promise<void>
  onUnsubscribe: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        data-feed-menu={feed.id}
        align="end"
        sideOffset={4}
        collisionPadding={12}
        onCloseAutoFocus={onCloseAutoFocus}
        className="undraggle z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <DropdownMenu.Item
          className={menuItemClass}
          disabled={!feed.unreadCount || busy || markFeedRead.isPending}
          onSelect={() => markFeedRead.mutate(feed.id!)}
        >
          <CheckCheck aria-hidden />
          {t('reader.action.markFeedRead')}
        </DropdownMenu.Item>
        <DropdownMenu.Item className={menuItemClass} onSelect={onCopy}>
          <Copy aria-hidden />
          {t('reader.action.copyFeedUrl')}
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
        <DropdownMenu.Item
          className={menuItemClass}
          disabled={busy || markFeedRead.isPending}
          onSelect={onUnsubscribe}
        >
          <Minus aria-hidden />
          {t('reader.action.unsubscribe')}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

function SidebarFeedActions({
  row, busy, markFeedRead, onCopy, onUnsubscribe,
}: FeedActions & { row: FeedRow; busy: boolean; markFeedRead: ReaderModel['markFeedRead'] }) {
  const { t } = useTranslation()
  const { feed, phase } = row
  const trigger = useRef<HTMLButtonElement | null>(null)
  const keyboardFocus = useRef(false)
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const copied = copiedAt !== null

  useEffect(() => {
    if (copiedAt === null) return undefined
    const timeout = window.setTimeout(() => setCopiedAt(null), 1500)
    return () => window.clearTimeout(timeout)
  }, [copiedAt])

  if (phase === 'confirmed') {
    return (
      <div
        data-feed-actions
        aria-hidden
        className={cn(actionsPosition, 'pointer-events-none size-8 justify-center text-theme-emphasis')}
      >
        <Check className="size-4" />
      </div>
    )
  }
  const pending = phase === 'pending'
  return (
    <div
      data-feed-actions
      data-feed-copied={copied || undefined}
      onPointerDownCapture={() => { keyboardFocus.current = false }}
      onKeyDownCapture={() => { keyboardFocus.current = true }}
      className={cn(
        actionsPosition,
        'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
        'group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100',
        'has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100',
        copied && 'pointer-events-auto opacity-100',
      )}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon-sm"
            aria-label={t('reader.action.feedMenu', { title: feed.title })}
            className={cn(
              'hover:bg-sidebar-foreground/6 dark:hover:bg-sidebar-foreground/6 focus-visible:ring-inset',
              'aria-expanded:bg-sidebar-foreground/10 aria-expanded:hover:bg-sidebar-foreground/10',
              copied && 'text-theme-emphasis',
            )}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {copied ? <Check aria-hidden /> : <Ellipsis aria-hidden />}
          </Button>
        </DropdownMenu.Trigger>
        <SidebarFeedMenu
          feed={feed}
          busy={busy}
          markFeedRead={markFeedRead}
          onCopy={async () => {
            if (await onCopy(feed.url)) setCopiedAt(Date.now())
          }}
          onUnsubscribe={() => {
            if (trigger.current) onUnsubscribe(feed.id!, trigger.current, keyboardFocus.current)
          }}
          onCloseAutoFocus={(event) => {
            if (!keyboardFocus.current) {
              event.preventDefault()
              trigger.current?.focus({ preventScroll: true, focusVisible: false })
            }
          }}
        />
      </DropdownMenu.Root>
      <span role="status" className="sr-only">{copied && t('reader.action.copy.success')}</span>
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
            model.tab === id ? 'bg-sidebar-current'
              : 'hover:bg-sidebar-accent has-focus-visible:bg-sidebar-accent has-[[data-state=open]]:bg-sidebar-accent',
          )}
        >
          <Button
            variant="ghost"
            aria-pressed={model.tab === id}
            className={cn(
              'w-full justify-start px-2 hover:bg-transparent focus-visible:ring-inset dark:hover:bg-transparent',
              'aria-pressed:[&>svg]:text-theme-emphasis',
              confirmed ? 'pr-9' : 'group-hover:pr-9 group-has-[:focus-visible]:pr-9 group-has-[[data-state=open]]:pr-9 group-has-[[data-feed-copied]]:pr-9',
            )}
            onClick={() => model.changeTab(id)}
          >
            <SidebarFeedIcon icon={feed.icon} />
            <span className={cn('truncate', !!feed.unreadCount && 'font-semibold')}>{feed.title}</span>
            {!!feed.unreadCount && !confirmed && (
              <span className="ml-auto text-xs tabular-nums group-hover:hidden group-has-[:focus-visible]:hidden group-has-[[data-state=open]]:hidden group-has-[[data-feed-copied]]:hidden">
                {feed.unreadCount}
              </span>
            )}
          </Button>
          <SidebarFeedActions
            row={row}
            busy={model.unsubscribe.isPending}
            markFeedRead={model.markFeedRead}
            onCopy={onCopy}
            onUnsubscribe={onUnsubscribe}
          />
        </div>
      </div>
    </div>
  )
}
