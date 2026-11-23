/* eslint-disable react/no-danger */
import {
  MouseEvent, RefObject, useMemo, useState,
} from 'react'
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

function ArticleVersionButtons({
  showFeed, onShowFeedChange, buttonRef,
}: {
  showFeed: boolean,
  onShowFeedChange: (showFeedContent: boolean) => void,
  buttonRef: RefObject<HTMLButtonElement | null>,
}) {
  const { t } = useTranslation()
  const versionClassName = 'font-normal decoration-1 underline-offset-4 aria-pressed:text-foreground aria-pressed:underline'
  return (
    <div className="inline-flex items-center gap-0.5" role="group" aria-label={t('reader.content.version')}>
      <Button
        ref={showFeed ? null : buttonRef}
        aria-keyshortcuts={showFeed ? undefined : 'F'}
        aria-pressed={showFeed}
        className={versionClassName}
        variant="ghost"
        size="xs"
        onClick={() => onShowFeedChange(true)}
      >
        {t('reader.content.feedContent')}
      </Button>
      <span aria-hidden="true">/</span>
      <Button
        ref={showFeed ? buttonRef : null}
        aria-keyshortcuts={showFeed ? 'F' : undefined}
        aria-pressed={!showFeed}
        className={versionClassName}
        variant="ghost"
        size="xs"
        onClick={() => onShowFeedChange(false)}
      >
        {t('reader.content.fullText')}
      </Button>
    </div>
  )
}

function LoadFullTextControl({
  article, hasContent, buttonRef,
}: {
  article: ArticleDetail,
  hasContent: boolean,
  buttonRef: RefObject<HTMLButtonElement | null>,
}) {
  const { t } = useTranslation()
  const load = useLoadFullText()
  if (!httpUrl(article.contentUrl || article.url) || (article.contentSource === 'full' && hasContent)) return null
  return (
    <>
      <Button
        ref={buttonRef}
        aria-keyshortcuts="F"
        className="font-normal text-foreground underline decoration-1 underline-offset-4"
        variant="ghost"
        size="xs"
        disabled={load.isPending}
        onClick={() => load.mutate(article.id!)}
      >
        {t(load.isPending ? 'common.loading' : 'reader.content.loadFullText')}
      </Button>
      {(load.isError || load.data === null) && (
        <p role="status" className="basis-full">{t('reader.content.fullTextError')}</p>
      )}
    </>
  )
}

export default function Content({ model, article, fullTextButtonRef }: {
  model: ReaderModel,
  article: ArticleDetail,
  fullTextButtonRef: RefObject<HTMLButtonElement | null>,
}) {
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
      <div className="mt-4 mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>{article.feedTitle}</span>
        {article.author !== article.feedTitle && <span>{article.author}</span>}
        <time dateTime={article.pubTime}>
          {formatDate(article.pubTime, i18n.resolvedLanguage ?? 'en-US', true)}
        </time>
        {article.fullText ? (
          <ArticleVersionButtons
            showFeed={showFeed}
            onShowFeedChange={setShowFeed}
            buttonRef={fullTextButtonRef}
          />
        ) : (
          <LoadFullTextControl article={article} hasContent={!!content} buttonRef={fullTextButtonRef} />
        )}
      </div>
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
