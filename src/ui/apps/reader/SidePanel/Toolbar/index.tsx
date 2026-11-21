import {
  ArrowDownToLine, ArrowUpToLine, Ellipsis, LoaderCircle,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'
import { cn } from '@/ui/lib/utils'
import { useFeedTransfer } from '@/ui/query/reader'
import AddButton from './add-btn'

const actions = [
  { action: 'import', Icon: ArrowDownToLine },
  { action: 'export', Icon: ArrowUpToLine },
] as const

export default function FeedToolbar({ hasFeeds }: { hasFeeds: boolean }) {
  const { t } = useTranslation()
  const transfer = useFeedTransfer()
  const { data, isError, variables } = transfer
  const error = data && 'error' in data ? data.error : isError ? `${variables}Error` : undefined

  return (
    <>
      <div className="flex items-center justify-between pl-2">
        <h2 className="text-xs font-medium text-muted-foreground">{t('reader.list.feeds')}</h2>
        <div className="flex items-center gap-1">
          <AddButton />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t('reader.transfer.menu')}>
                {transfer.isPending ? <LoaderCircle className="animate-spin" /> : <Ellipsis />}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="undraggle z-50 min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              >
                {actions.map(({ action, Icon }) => (
                  <DropdownMenu.Item
                    key={action}
                    disabled={transfer.isPending || (action === 'export' && !hasFeeds)}
                    onSelect={() => transfer.mutate(action)}
                    className={cn(
                      'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm whitespace-nowrap outline-none',
                      'data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {t(`reader.transfer.${action}`)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
      {error && <p role="alert" className="mt-1 px-2 text-xs text-destructive">{t(`reader.transfer.${error}`)}</p>}
    </>
  )
}
