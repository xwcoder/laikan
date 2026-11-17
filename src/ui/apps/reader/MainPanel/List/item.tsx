import { useTranslation } from 'react-i18next'
import { Article } from '@/types/reader'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Checkbox } from '@/ui/components/ui/checkbox'
import { cn } from '@/ui/lib/utils'
import { formatDate } from '@/ui/lib/date'
import { StarButton } from '../../components/toolbar'

export default function Item({ model, article }: { model: ReaderModel; article: Article }) {
  const { t, i18n } = useTranslation()
  const { selectedIds, activeId } = model
  const feed = model.feeds.data?.find((item) => item.id === article.feedId)
  return (
    <div
      data-list-item-id={article.id}
      className={cn(
        'relative flex min-h-12 items-center gap-2 border-b px-4 hover:bg-muted/70',
        article.read ? 'bg-muted/40 text-muted-foreground' : 'font-medium',
        selectedIds.includes(article.id!) && 'bg-accent',
        article.id === activeId && 'border-l-2 border-l-primary pl-3.5',
      )}
    >
      <Checkbox
        aria-label={t('reader.list.selectArticle', { title: article.title })}
        checked={selectedIds.includes(article.id!)}
        onCheckedChange={() => model.toggleSelected(article.id!)}
      />
      <StarButton model={model} article={article} />
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => model.open(article.id!)}
      >
        <span
          className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground xl:block"
          title={feed?.title}
        >
          {feed?.title}
        </span>
        <span className="min-w-0 flex-1 truncate">{article.title}</span>
        <time className="shrink-0 text-xs font-normal text-muted-foreground" dateTime={article.pubTime}>
          {formatDate(article.pubTime, i18n.resolvedLanguage ?? 'en-US')}
        </time>
      </button>
    </div>
  )
}
