import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'
import { DialogClose } from '@/ui/components/ui/dialog'

export function LocalizedDialogClose() {
  const { t } = useTranslation()
  return (
    <DialogClose asChild>
      <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label={t('common.close')}>
        <X aria-hidden />
      </Button>
    </DialogClose>
  )
}
