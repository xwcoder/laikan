import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { AsyncState } from '@/ui/components/async-state'

import Item from './item'
import Toolbar from './toolbar'
import { useListPosition } from './use-list-position'

export default function List({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const { articles } = model
  const {
    ref, rememberPosition, onFocus, onBlur,
  } = useListPosition(model)
  if (model.opened) return null
  const refresh = () => {
    if (model.refresh.isPending) return
    rememberPosition()
    model.refreshList()
  }

  return (
    <>
      <Toolbar model={model} onRefresh={refresh} />
      {model.list.isPending || model.list.isError ? (
        <AsyncState error={model.list.isError} retry={() => model.list.refetch()} />
      ) : (
        <div
          ref={ref}
          onScroll={rememberPosition}
          onFocus={onFocus}
          onBlur={onBlur}
          className="list-container reader-scrollbar min-h-0 flex-1 overflow-y-auto pb-6 [overflow-anchor:none]"
        >
          {articles.length ? (
            articles.map((article) => <Item key={article.id} model={model} article={article} />)
          ) : (
            <div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Inbox className="mb-2 size-9 opacity-60" />
              <h2 className="font-medium text-foreground">{t('reader.list.empty')}</h2>
              <p className="text-xs">{t('reader.list.emptyDescription')}</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
