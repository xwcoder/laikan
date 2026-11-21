import { CircleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/ui/store'
import { Button } from '@/ui/components/ui/button'
import { Alert, AlertDescription } from '@/ui/components/ui/alert'
import { cn } from '@/ui/lib/utils'

export function ErrorAlert({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { error, setError } = useAppStore()
  if (!error) return null

  return (
    <Alert variant="destructive" className={cn('undraggle shrink-0', className)}>
      <CircleAlert aria-hidden />
      <AlertDescription className="flex items-center justify-between gap-2">
        {t('common.saveError')}
        <Button variant="ghost" size="icon-xs" aria-label={t('common.close')} onClick={() => setError(null)}>
          <X aria-hidden />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
