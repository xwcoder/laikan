/* eslint-disable react/no-danger */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { formatDate } from '@/ui/lib/date'
import { openExternal } from '@/base/browser/shell'
import { cn } from '@/ui/lib/utils'
import { articleContent } from '@/ui/lib/article-content'
import { externalUrl } from '@/base/common/url'

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

export default function Content({ model }: { model: ReaderModel }) {
  const { i18n } = useTranslation()
  const article = model.activeArticle
  const feed = model.feeds.data?.find((item) => item.id === article?.feedId)
  const base = article?.contentBase || article?.url || feed?.link || feed?.url
  const content = useMemo(
    () => articleContent(article?.content ?? '', base),
    [article?.content, base],
  )
  if (!article) return null

  return (
    <article className="mx-auto max-w-4xl px-8 pt-8 pb-16">
      <h1 className="text-2xl leading-snug font-semibold tracking-tight">{article.title}</h1>
      <div className="mt-4 mb-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>{feed?.title}</span>
        {article.author !== feed?.title && <span>{article.author}</span>}
        <time dateTime={article.pubTime}>
          {formatDate(article.pubTime, i18n.resolvedLanguage ?? 'en-US', true)}
        </time>
      </div>
      <div
        className={cn(
          'article-content prose max-w-none prose-headings:font-semibold prose-a:break-all prose-pre:overflow-x-auto',
          fontSizes[model.fontSize],
        )}
        onClick={(event) => {
          const anchor = (event.target as Element).closest('a')
          if (!anchor?.href) return
          event.preventDefault()
          const url = externalUrl(anchor.getAttribute('href')!, base)
          if (url) openExternal(url)
        }}
        role="presentation"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  )
}
