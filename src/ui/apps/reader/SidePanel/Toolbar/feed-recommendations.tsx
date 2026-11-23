import {
  Check, Compass, LoaderCircle, Minus, Plus,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FeedError } from '@/base/common/feed-error'
import { feedUrlKey } from '@/base/common/feed-url'
import { RecommendedFeed, recommendedGroups } from '@/base/common/recommended-feeds'
import { recommendedIcon } from '@/base/common/recommended-icons'
import { Feed } from '@/types/reader'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { useRecommendedSubscriptions } from '@/ui/query/reader'
import { Button } from '@/ui/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/ui/components/ui/dialog'
import { LocalizedDialogClose } from '@/ui/components/localized-dialog-close'
import { cn } from '@/ui/lib/utils'

const actionLabels = [
  { state: 'subscribe', label: 'reader.form.buttons.subscribe', Icon: Plus },
  { state: 'subscribed', label: 'reader.recommendations.subscribed', Icon: Check },
  { state: 'unsubscribe', label: 'reader.action.unsubscribe', Icon: Minus },
] as const

function FeedIcon({ source }: { source: RecommendedFeed }) {
  const url = recommendedIcon(source.icon)
  return (
    <div aria-hidden className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70 text-sm font-semibold text-muted-foreground">
      {url ? <img className="size-7 rounded-sm object-contain" alt="" src={url} /> : Array.from(source.title)[0]}
    </div>
  )
}

function recommendationError(subscribed: boolean, unsubscribeFailed: boolean, subscribeError: Error | null) {
  if (subscribed) return unsubscribeFailed ? 'reader.unsubscribe.error' : undefined
  if (subscribeError instanceof FeedError) return `reader.form.errors.${subscribeError.kind}`
  return subscribeError ? 'reader.recommendations.subscribeError' : undefined
}

function Recommendation({
  source, subscribed, subscriptionsKnown, subscribing, subscribeError, onSubscribe, unsubscribe,
}: {
  source: RecommendedFeed
  subscribed?: Feed
  subscriptionsKnown: boolean
  subscribing: boolean
  subscribeError: Error | null
  onSubscribe: (data: Pick<Feed, 'url' | 'title'>) => void
  unsubscribe: ReaderModel['unsubscribe']
}) {
  const { t } = useTranslation()
  const [unsubscribeFailed, setUnsubscribeFailed] = useState(false)
  const removing = unsubscribe.isPending && unsubscribe.variables === subscribed?.id
  const pending = subscribing || removing
  const disabled = !subscriptionsKnown || subscribing || unsubscribe.isPending
  const error = recommendationError(!!subscribed, unsubscribeFailed, subscribeError)
  const action = removing ? 'unsubscribe' : subscribed && !subscribing ? 'subscribed' : 'subscribe'

  const toggle = () => {
    if (disabled) return
    setUnsubscribeFailed(false)
    if (subscribed?.id !== undefined) {
      unsubscribe.mutate(subscribed.id, { onError: () => setUnsubscribeFailed(true) })
    } else {
      onSubscribe({ url: source.url, title: source.title })
    }
  }

  return (
    <li data-recommended-feed={source.id} className="flex items-start gap-3 py-3.5 sm:gap-4">
      <FeedIcon source={source} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <h4 className="min-w-0 text-sm leading-snug font-semibold wrap-anywhere">{source.title}</h4>
          <span className="inline-flex items-baseline gap-1.5 text-[11px] leading-none whitespace-nowrap text-muted-foreground">
            <span aria-hidden>·</span>
            {t(`reader.recommendations.languages.${source.language}`)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t(`reader.recommendations.descriptions.${source.id}`)}
        </p>
        {error && <p role="alert" className="mt-1.5 text-xs text-destructive">{t(error)}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'group/recommendation self-center border text-xs aria-disabled:opacity-50',
          action === 'subscribe' && 'bg-theme-emphasis/10 hover:bg-theme-emphasis/15 dark:hover:bg-theme-emphasis/15',
        )}
        disabled={!subscriptionsKnown}
        aria-disabled={disabled}
        aria-busy={pending}
        onClick={toggle}
      >
        {/* Overlap the labels so the longest translation sets the width in every state. */}
        <span className="grid">
          {actionLabels.map(({ state, label, Icon }) => {
            const loading = pending && action === state
            const ActionIcon = loading ? LoaderCircle : Icon
            return (
              <span
                key={state}
                className={cn(
                  'col-start-1 row-start-1 flex items-center justify-center gap-1.5',
                  state !== action && 'invisible',
                  state === 'subscribed'
                    && 'group-hover/recommendation:invisible group-focus-visible/recommendation:invisible',
                  state === 'unsubscribe' && action === 'subscribed'
                    && 'group-hover/recommendation:visible group-focus-visible/recommendation:visible',
                )}
              >
                <ActionIcon
                  aria-hidden
                  className={cn(
                    'size-3.5',
                    state === 'subscribe' ? 'text-theme-emphasis' : 'text-muted-foreground',
                    loading && 'animate-spin',
                  )}
                />
                {t(label)}
              </span>
            )
          })}
        </span>
      </Button>
    </li>
  )
}

export default function FeedRecommendations({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const { subscribe, attempts } = useRecommendedSubscriptions()
  const label = t('reader.recommendations.title')
  const byUrl = new Map(model.feeds.data?.map((feed) => [feedUrlKey(feed.url), feed] as const))

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={label}>
          <Compass aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        data-feed-recommendations
        className="undraggle flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="relative h-13 shrink-0 justify-center border-b px-5 pr-14 text-left sm:pl-6">
          <LocalizedDialogClose className="top-1/2 -translate-y-1/2" />
          <DialogTitle className="text-lg leading-6 font-semibold tracking-tight">{label}</DialogTitle>
          <DialogDescription className="sr-only">{t('reader.recommendations.description')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
          {model.feeds.isPending && (
            <p role="status" className="pt-4 text-xs text-muted-foreground">{t('common.loading')}</p>
          )}
          {model.feeds.isError && !model.feeds.data && (
            <div className="flex items-center gap-3 pt-4 text-xs">
              <p role="alert" className="text-destructive">{t('common.loadError')}</p>
              <Button variant="outline" size="sm" onClick={() => model.feeds.refetch()}>{t('common.retry')}</Button>
            </div>
          )}
          {recommendedGroups.map((group) => (
            <section key={group.id} className="mt-5" aria-labelledby={`recommended-${group.id}`}>
              <h3 id={`recommended-${group.id}`} className="text-xs font-semibold text-muted-foreground">
                {t(`reader.recommendations.groups.${group.id}`)}
              </h3>
              <ul className="mt-1 divide-y divide-border/70">
                {group.feeds.map((source) => {
                  const url = feedUrlKey(source.url)
                  const attempt = attempts.get(url)
                  return (
                    <Recommendation
                      key={source.id}
                      source={source}
                      subscribed={byUrl.get(url)}
                      subscriptionsKnown={!!model.feeds.data}
                      subscribing={attempt?.pending ?? false}
                      subscribeError={attempt?.error ?? null}
                      onSubscribe={subscribe}
                      unsubscribe={model.unsubscribe}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
