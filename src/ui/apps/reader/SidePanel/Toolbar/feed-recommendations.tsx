import { Compass, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FeedError } from '@/base/common/feed-error'
import { feedUrlKey } from '@/base/common/feed-url'
import { Feed } from '@/types/reader'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { useSubscribe } from '@/ui/query/reader'
import { Button } from '@/ui/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/ui/components/ui/dialog'
import { LocalizedDialogClose } from '@/ui/components/localized-dialog-close'
import { RecommendedFeed, recommendedGroups } from './recommended-feeds'

const icons = import.meta.glob<string>('../../../../assets/feed-icons/*.png', {
  eager: true, query: '?url', import: 'default',
})

function FeedIcon({ source }: { source: RecommendedFeed }) {
  const url = icons[`../../../../assets/feed-icons/${source.icon}.png`]
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
  source, subscribed, subscriptionsKnown, unsubscribe,
}: {
  source: RecommendedFeed
  subscribed?: Feed
  subscriptionsKnown: boolean
  unsubscribe: ReaderModel['unsubscribe']
}) {
  const { t } = useTranslation()
  const subscribe = useSubscribe(true)
  const [unsubscribeFailed, setUnsubscribeFailed] = useState(false)
  const removing = unsubscribe.isPending && unsubscribe.variables === subscribed?.id
  const pending = subscribe.isPending || removing
  const disabled = !subscriptionsKnown || subscribe.isPending || unsubscribe.isPending
  const error = recommendationError(!!subscribed, unsubscribeFailed, subscribe.error)
  const action = subscribed
    ? { label: 'reader.action.unsubscribe', variant: 'ghost' as const }
    : { label: 'reader.form.buttons.subscribe', variant: 'outline' as const }

  const toggle = () => {
    if (disabled) return
    setUnsubscribeFailed(false)
    if (subscribed?.id !== undefined) {
      subscribe.reset()
      unsubscribe.mutate(subscribed.id, { onError: () => setUnsubscribeFailed(true) })
    } else {
      subscribe.mutate({ url: source.url, title: source.title })
    }
  }

  return (
    <li data-recommended-feed={source.id} className="flex items-start gap-3 py-3.5 sm:gap-4">
      <FeedIcon source={source} />
      <div className="min-w-0 flex-1">
        <h4 className="text-sm leading-snug font-semibold">{source.title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t(`reader.recommendations.descriptions.${source.id}`)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t(`reader.recommendations.languages.${source.language}`)}
        </p>
        {error && <p role="alert" className="mt-1.5 text-xs text-destructive">{t(error)}</p>}
      </div>
      <Button
        type="button"
        variant={action.variant}
        size="sm"
        className="min-w-22 self-center aria-disabled:opacity-50"
        disabled={!subscriptionsKnown}
        aria-disabled={disabled}
        aria-busy={pending}
        onClick={toggle}
      >
        {pending && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
        {t(action.label)}
      </Button>
    </li>
  )
}

export default function FeedRecommendations({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
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
                {group.feeds.map((source) => (
                  <Recommendation
                    key={source.id}
                    source={source}
                    subscribed={byUrl.get(feedUrlKey(source.url))}
                    subscriptionsKnown={!!model.feeds.data}
                    unsubscribe={model.unsubscribe}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
