import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'

export function AsyncState({ error, retry }: { error?: boolean; retry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground"
      role="status"
    >
      {error ? (
        <p>{t('common.loadError')}</p>
      ) : (
        <>
          <LoaderCircle className="size-5 animate-spin" />
          <p>{t('common.loading')}</p>
        </>
      )}
      {error && retry && (
        <Button variant="outline" onClick={retry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
