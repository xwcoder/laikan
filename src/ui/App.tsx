import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import Nav from '@/ui/Nav'
import { useAppStore } from '@/ui/store'
import ReaderApp from '@/ui/apps/reader'
import Settings from '@/ui/apps/settings'
import { usePreferences } from '@/ui/hooks/use-preferences'
import { readerKeys } from '@/ui/query/reader'
import { settingsOptions } from '@/ui/query/settings'
import * as remote from '@/services/remote/browser/remote'
import { Button } from '@/ui/components/ui/button'
import { AsyncState } from '@/ui/components/async-state'

export default function App() {
  const { t, i18n } = useTranslation()
  const { app, error, setError } = useAppStore()
  const settings = usePreferences()
  const client = useQueryClient()

  useEffect(
    () => remote.on('/reader/feed', () => {
      client.invalidateQueries({ queryKey: readerKeys.all })
    }),
    [client],
  )

  useEffect(
    () => remote.on('/settings/change', () => {
      client.invalidateQueries({ queryKey: settingsOptions.queryKey })
    }),
    [client],
  )

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en-US'
  }, [i18n.resolvedLanguage])

  return (
    <div className="grid h-screen grid-cols-[60px_minmax(0,1fr)] bg-sidebar text-foreground">
      <Nav />
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="draggle h-7 shrink-0" />
        {error && (
          <div
            role="alert"
            className="undraggle mx-4 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive"
          >
            <span className="min-w-0 flex-1 break-words">
              {t('common.saveError')}
            </span>
            <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={() => setError(null)}>
              <X />
            </Button>
          </div>
        )}
        {settings.isPending || settings.isError ? (
          <AsyncState error={settings.isError} retry={() => settings.refetch()} />
        ) : app === 'settings' ? (
          <Settings />
        ) : (
          <ReaderApp />
        )}
      </main>
    </div>
  )
}
