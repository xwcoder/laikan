import { AlertDialog } from 'radix-ui'
import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'

type Props = {
  title: string | null
  deleting: boolean
  failed: boolean
  onCancel: () => void
  onConfirm: () => void
  onCloseAutoFocus: (event: Event) => void
}

export default function DeleteFeedDialog({
  title, deleting, failed, onCancel, onConfirm, onCloseAutoFocus,
}: Props) {
  const { t } = useTranslation()
  return (
    <AlertDialog.Root open={title !== null} onOpenChange={(open) => { if (!open && !deleting) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content
          className="undraggle fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg outline-none"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <AlertDialog.Title className="text-lg font-semibold wrap-anywhere">
            {t('reader.deleteFeed.title', { title })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">
            {t('reader.deleteFeed.description')}
          </AlertDialog.Description>
          {failed && <p role="alert" className="text-sm text-destructive">{t('reader.deleteFeed.error')}</p>}
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={deleting}>{t('common.cancel')}</Button>
            </AlertDialog.Cancel>
            <Button
              variant="destructive"
              aria-disabled={deleting}
              onClick={() => { if (!deleting) onConfirm() }}
            >
              {deleting && <LoaderCircle className="animate-spin" />}
              {t(deleting ? 'reader.deleteFeed.deleting' : 'reader.action.delete')}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
