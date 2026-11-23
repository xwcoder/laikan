/* eslint-disable react/no-danger */
import {
  MouseEvent, RefObject, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/ui/lib/date'
import { openExternal } from '@/base/browser/shell'
import { articleContent } from '@/ui/lib/article-content'
import { externalUrl, httpUrl } from '@/base/common/url'
import { ArticleDetail } from '@/types/reader'
import { useLoadFullText } from '@/ui/query/reader'
import { Button } from '@/ui/components/ui/button'

function getReadingAnchor(article: HTMLElement, viewport: HTMLElement) {
  if (!viewport.scrollTop) return undefined
  const { left, width } = article.getBoundingClientRect()
  const x = left + width / 2
  const y = viewport.getBoundingClientRect().top + 1
  const element = document.elementFromPoint(x, y)
  if (!element || !article.contains(element)) return undefined

  const caret = document.caretPositionFromPoint(x, y)
  if (caret?.offsetNode instanceof Text && element.contains(caret.offsetNode)) {
    return () => caret.getClientRect()?.top
  }
  return () => element.getBoundingClientRect().top
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

export default function Content({ fontSize, article, fullTextButtonRef }: {
  fontSize: number,
  article: ArticleDetail,
  fullTextButtonRef: RefObject<HTMLButtonElement | null>,
}) {
  const { t, i18n } = useTranslation()
  const [showFeed, setShowFeed] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  const displayed = showFeed ? article : article.fullText ?? article
  const base = [displayed.contentBase, article.url, article.feedLink, article.feedUrl]
    .map((url) => httpUrl(url ?? undefined)).find(Boolean)
  const tableLabel = t('reader.content.table')
  const content = useMemo(
    () => articleContent(displayed.content, { base, articleUrl: article.url, tableLabel }),
    [displayed.content, base, article.url, tableLabel],
  )

  useLayoutEffect(() => {
    const element = articleRef.current
    const viewport = element?.parentElement
    if (!element || !viewport) return

    // Keep the text at the top of the viewport in place as the lines rewrap.
    const anchor = getReadingAnchor(element, viewport)
    const before = anchor?.()
    element.style.fontSize = `${fontSize}px`
    const after = anchor?.()
    if (before !== undefined && after !== undefined) viewport.scrollTop += after - before
  }, [fontSize])

  return (
    <article ref={articleRef} className="mx-auto max-w-4xl px-8 pt-8 pb-16">
      <h1 className="article-title leading-snug font-semibold tracking-tight">{article.title}</h1>
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
        className="article-content prose max-w-none prose-headings:font-semibold prose-a:break-all"
        onClick={(event) => openArticleLink(event, base)}
        role="presentation"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  )
}
