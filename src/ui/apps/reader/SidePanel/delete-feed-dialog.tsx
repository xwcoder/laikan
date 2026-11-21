import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog'

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
    <AlertDialog open={title !== null} onOpenChange={(open) => { if (!open && !deleting) onCancel() }}>
      <AlertDialogContent className="undraggle max-h-[85dvh] overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">
            {t('reader.deleteFeed.title', { title })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('reader.deleteFeed.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && <p role="alert" className="text-sm text-destructive">{t('reader.deleteFeed.error')}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            aria-disabled={deleting}
            onClick={(event) => {
              event.preventDefault()
              if (!deleting) onConfirm()
            }}
          >
            {deleting && <LoaderCircle className="animate-spin" />}
            {t(deleting ? 'reader.deleteFeed.deleting' : 'reader.action.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
