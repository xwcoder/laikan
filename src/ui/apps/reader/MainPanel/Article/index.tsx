import { RefObject, useEffect } from 'react'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { AsyncState } from '@/ui/components/async-state'
import { ArticleToolbar } from '../../components/toolbar'
import Content from './content'

function focusArticle(viewport: HTMLDivElement | null) {
  viewport?.focus({ preventScroll: true })
}

export default function Article({ model, fullTextButtonRef }: {
  model: ReaderModel,
  fullTextButtonRef: RefObject<HTMLButtonElement | null>,
}) {
  const article = model.detail.data
  useEffect(() => {
    if (article?.id && !article.read) model.markRead(1, [article.id])
  }, [article?.id])

  return (
    <>
      <ArticleToolbar model={model} />
      {model.detail.isPending || model.detail.isError ? (
        <AsyncState error={model.detail.isError} retry={() => model.detail.refetch()} />
      ) : article ? (
        <div
          key={article.id}
          ref={focusArticle}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <Content fontSize={model.fontSize} article={article} fullTextButtonRef={fullTextButtonRef} />
        </div>
      ) : (
        <AsyncState error retry={model.fold} />
      )}
    </>
  )
}
