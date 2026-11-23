import {
  ArrowLeft, ExternalLink, Mail, MailOpen, Star,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { readerFontSize } from '@/base/common/reader-font-size'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { ArticleListItem } from '@/types/reader'
import { IconButton } from '@/ui/components/icon-button'
import { Separator } from '@/ui/components/ui/separator'
import { openExternal } from '@/base/browser/shell'
import { cn } from '@/ui/lib/utils'
import { httpUrl } from '@/base/common/url'

export function StarButton({ model, article }: { model: ReaderModel; article: ArticleListItem }) {
  const { t } = useTranslation()
  return (
    <IconButton
      label={t(article.starred ? 'reader.action.unstar' : 'reader.action.star')}
      aria-pressed={!!article.starred}
      size="icon-sm"
      disabled={model.writing}
      onClick={() => model.toggleStar(article.id!)}
    >
      <Star className={cn(!!article.starred && 'fill-current text-star')} />
    </IconButton>
  )
}

export function MarkReadButton({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const targets = model.opened && model.activeArticle
    ? [model.activeArticle]
    : model.articles.filter((a) => model.selectedIds.includes(a.id!))
  const read = !targets.some((article) => !article.read)
  return (
    <IconButton
      label={t(read ? 'reader.action.markUnread' : 'reader.action.markRead')}
      disabled={!targets.length || model.writing}
      onClick={model.toggleRead}
    >
      {read ? <Mail /> : <MailOpen />}
    </IconButton>
  )
}

export function ArticleToolbar({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const article = model.activeArticle
  const url = httpUrl(article?.url)
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
      <IconButton label={t('reader.action.back')} onClick={model.fold}>
        <ArrowLeft />
      </IconButton>
      <div className="mx-2 h-5">
        <Separator orientation="vertical" />
      </div>
      <MarkReadButton model={model} />
      {article && <StarButton model={model} article={article} />}
      <IconButton
        label={t('reader.action.openExternal')}
        disabled={!url}
        onClick={() => url && openExternal(url)}
      >
        <ExternalLink />
      </IconButton>
      <div className="ml-auto flex items-center" role="group" aria-label={t('reader.action.fontSize')}>
        <IconButton
          label={t('reader.action.fontDecrease')}
          aria-keyshortcuts="-"
          disabled={model.fontSize <= readerFontSize.min}
          onClick={() => model.changeFont(-1)}
        >
          <span aria-hidden="true">A−</span>
        </IconButton>
        <span className="w-12 text-center text-xs text-muted-foreground tabular-nums" role="status">
          {model.fontSize}
          {' px'}
        </span>
        <IconButton
          label={t('reader.action.fontIncrease')}
          aria-keyshortcuts="plus = Shift+="
          disabled={model.fontSize >= readerFontSize.max}
          onClick={() => model.changeFont(1)}
        >
          <span aria-hidden="true">A+</span>
        </IconButton>
      </div>
    </div>
  )
}
