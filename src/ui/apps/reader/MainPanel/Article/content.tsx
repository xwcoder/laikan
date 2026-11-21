/* eslint-disable react/no-danger */
import { MouseEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { formatDate } from '@/ui/lib/date'
import { openExternal } from '@/base/browser/shell'
import { cn } from '@/ui/lib/utils'
import { articleContent } from '@/ui/lib/article-content'
import { externalUrl, httpUrl } from '@/base/common/url'
import { ArticleDetail } from '@/types/reader'
import { useLoadFullText } from '@/ui/query/reader'
import { Button } from '@/ui/components/ui/button'

const fontSizes: Record<number, string> = {
  12: 'text-[12px]',
  13: 'text-[13px]',
  14: 'text-[14px]',
  15: 'text-[15px]',
  16: 'text-[16px]',
  17: 'text-[17px]',
  18: 'text-[18px]',
  19: 'text-[19px]',
  20: 'text-[20px]',
  21: 'text-[21px]',
  22: 'text-[22px]',
  23: 'text-[23px]',
  24: 'text-[24px]',
}

function openArticleLink(event: MouseEvent<HTMLDivElement>, base?: string) {
  const anchor = (event.target as Element).closest('a[href]')
  const href = anchor?.getAttribute('href')
  if (!href) return
  event.preventDefault()
  if (href.startsWith('#')) {
    const target = event.currentTarget.querySelector(`#${CSS.escape(href.slice(1))}`)
    target?.scrollIntoView({ block: 'start' })
    return
  }
  const url = externalUrl(href, base)
  if (url) openExternal(url)
}

function FullTextControls({
  article, showFeed, toggle, hasContent,
}: {
  article: ArticleDetail, showFeed: boolean, toggle: () => void, hasContent: boolean,
}) {
  const { t } = useTranslation()
  const load = useLoadFullText()
  if (article.fullText) {
    return (
      <Button className="mb-6" variant="outline" size="sm" onClick={toggle}>
        {t(showFeed ? 'reader.content.showFullText' : 'reader.content.showFeed')}
      </Button>
    )
  }
  if (!httpUrl(article.contentUrl || article.url) || (article.contentSource === 'full' && hasContent)) return null
  return (
    <>
      <Button className="mb-6" variant="outline" size="sm" disabled={load.isPending} onClick={() => load.mutate(article.id!)}>
        {t(load.isPending ? 'common.loading' : 'reader.content.loadFullText')}
      </Button>
      {(load.isError || load.data === null) && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">{t('reader.content.fullTextError')}</p>
      )}
    </>
  )
}

export default function Content({ model, article }: { model: ReaderModel, article: ArticleDetail }) {
  const { t, i18n } = useTranslation()
  const [showFeed, setShowFeed] = useState(false)
  const displayed = showFeed ? article : article.fullText ?? article
  const base = [displayed.contentBase, article.url, article.feedLink, article.feedUrl]
    .map((url) => httpUrl(url ?? undefined)).find(Boolean)
  const tableLabel = t('reader.content.table')
  const content = useMemo(
    () => articleContent(displayed.content, { base, articleUrl: article.url, tableLabel }),
    [displayed.content, base, article.url, tableLabel],
  )

  return (
    <article className="mx-auto max-w-4xl px-8 pt-8 pb-16">
      <h1 className="text-2xl leading-snug font-semibold tracking-tight">{article.title}</h1>
      <div className="mt-4 mb-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>{article.feedTitle}</span>
        {article.author !== article.feedTitle && <span>{article.author}</span>}
        <time dateTime={article.pubTime}>
          {formatDate(article.pubTime, i18n.resolvedLanguage ?? 'en-US', true)}
        </time>
      </div>
      <FullTextControls
        article={article}
        showFeed={showFeed}
        toggle={() => setShowFeed(!showFeed)}
        hasContent={!!content}
      />
      {!content && <p className="text-sm text-muted-foreground">{t('reader.content.empty')}</p>}
      <div
        className={cn(
          'article-content prose max-w-none prose-headings:font-semibold prose-a:break-all',
          fontSizes[model.fontSize],
        )}
        onClick={(event) => openArticleLink(event, base)}
        role="presentation"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  )
}
