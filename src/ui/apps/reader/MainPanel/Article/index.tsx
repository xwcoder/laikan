import { RefObject, useEffect } from 'react'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { AsyncState } from '@/ui/components/async-state'
import { ArticleToolbar } from '../../components/toolbar'
import Content from './content'

function isSpaceScroll(event: KeyboardEvent) {
  return event.key === ' ' && !event.defaultPrevented && !event.isComposing
    && !event.altKey && !event.ctrlKey && !event.metaKey
}

function attachArticleViewport(viewport: HTMLDivElement | null) {
  if (!viewport) return undefined

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let scrollTarget: number | undefined
  const clearScrollTarget = () => { scrollTarget = undefined }
  const scrollOnSpace = (event: KeyboardEvent) => {
    if (event.target !== viewport || !isSpaceScroll(event)) return

    event.preventDefault()
    const direction = event.shiftKey ? -1 : 1
    const step = direction * viewport.clientHeight * 0.75
    const maxTop = viewport.scrollHeight - viewport.clientHeight
    const top = Math.min(maxTop, Math.max(0, (scrollTarget ?? viewport.scrollTop) + step))
    const behavior = reducedMotion.matches ? 'instant' : 'smooth'
    scrollTarget = behavior === 'smooth' && top !== viewport.scrollTop ? top : undefined
    viewport.scrollTo({ top, behavior })
  }

  viewport.addEventListener('keydown', scrollOnSpace)
  viewport.addEventListener('scrollend', clearScrollTarget)
  viewport.focus({ preventScroll: true })
  return () => {
    viewport.removeEventListener('keydown', scrollOnSpace)
    viewport.removeEventListener('scrollend', clearScrollTarget)
  }
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
          ref={attachArticleViewport}
          tabIndex={-1}
          className="reader-scrollbar min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <Content fontSize={model.fontSize} article={article} fullTextButtonRef={fullTextButtonRef} />
        </div>
      ) : (
        <AsyncState error retry={model.fold} />
      )}
    </>
  )
}
