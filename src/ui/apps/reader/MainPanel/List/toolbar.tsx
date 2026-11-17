import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { Checkbox } from '@/ui/components/ui/checkbox'
import { IconButton } from '@/ui/components/icon-button'
import { cn } from '@/ui/lib/utils'
import { MarkReadButton } from '../../components/toolbar'

export default function Toolbar({ model }: { model: ReaderModel }) {
  const { t } = useTranslation()
  const {
    articles, selectedIds, count, page, size,
  } = model
  const selected = articles.length > 0 && articles.every((a) => selectedIds.includes(a.id!))
  const checked = selected ? true : selectedIds.length ? 'indeterminate' : false
  const start = count ? (page - 1) * size + 1 : 0
  const end = count ? start + articles.length - 1 : 0
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <Checkbox
        aria-label={t('reader.list.selectAll')}
        checked={checked}
        disabled={!articles.length}
        onCheckedChange={() => model.select(checked === true ? [] : articles.map((a) => a.id!))}
      />
      {selectedIds.length ? (
        <MarkReadButton model={model} />
      ) : (
        <IconButton
          label={t('reader.action.refresh')}
          disabled={model.list.isFetching}
          onClick={model.refresh}
        >
          <RefreshCw className={cn(model.list.isFetching && 'animate-spin')} />
        </IconButton>
      )}
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 text-xs text-muted-foreground tabular-nums">
          {t('reader.list.range', { start, end, count })}
        </span>
        <IconButton
          label={t('reader.list.previousPage')}
          disabled={page <= 1 || model.list.isFetching}
          onClick={() => model.changePage(page - 1)}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          label={t('reader.list.nextPage')}
          disabled={page * size >= count || model.list.isFetching}
          onClick={() => model.changePage(page + 1)}
        >
          <ChevronRight />
        </IconButton>
      </div>
    </div>
  )
}
