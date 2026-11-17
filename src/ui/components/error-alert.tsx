import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/ui/store'
import { Button } from '@/ui/components/ui/button'
import { cn } from '@/ui/lib/utils'

export function ErrorAlert({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { error, setError } = useAppStore()
  if (!error) return null

  return (
    <div
      role="alert"
      className={cn('undraggle flex shrink-0 items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive', className)}
    >
      <span className="min-w-0 flex-1 break-words">{t('common.saveError')}</span>
      <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={() => setError(null)}>
        <X />
      </Button>
    </div>
  )
}
