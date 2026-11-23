import { RefObject, useEffect } from 'react'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { AsyncState } from '@/ui/components/async-state'
import { ArticleToolbar } from '../../components/toolbar'
import Content from './content'

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
        <div key={article.id} className="min-h-0 flex-1 overflow-y-auto">
          <Content fontSize={model.fontSize} article={article} fullTextButtonRef={fullTextButtonRef} />
        </div>
      ) : (
        <AsyncState error retry={model.fold} />
      )}
    </>
  )
}
