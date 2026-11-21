import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'
import { DialogClose } from '@/ui/components/ui/dialog'
import { cn } from '@/ui/lib/utils'

export function LocalizedDialogClose({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <DialogClose asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn('absolute top-3 right-3', className)}
        aria-label={t('common.close')}
      >
        <X aria-hidden />
      </Button>
    </DialogClose>
  )
}
