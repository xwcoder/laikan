import { useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import ReaderApp from '@/ui/apps/reader'
import { usePreferences } from '@/ui/hooks/use-preferences'
import { readerKeys } from '@/ui/query/reader'
import { settingsOptions } from '@/ui/query/settings'
import { useReaderStore } from '@/ui/store/reader'
import * as remote from '@/services/remote/browser/remote'
import { AsyncState } from '@/ui/components/async-state'
import { ErrorAlert } from '@/ui/components/error-alert'

export default function App() {
  const { i18n } = useTranslation()
  const settings = usePreferences()
  const client = useQueryClient()
  const revision = settings.data?.libraryRevision

  useLayoutEffect(() => {
    const reader = useReaderStore.getState()
    if (revision === undefined || revision <= reader.libraryRevision) return
    reader.changeLibrary(revision)
    client.removeQueries({ queryKey: readerKeys(reader.libraryRevision).all })
  }, [client, revision])

  useEffect(
    () => remote.on('/reader/feed', () => {
      const { libraryRevision } = useReaderStore.getState()
      client.invalidateQueries({ queryKey: readerKeys(libraryRevision).all })
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
    <main className="flex h-screen min-h-0 min-w-0 flex-col bg-sidebar text-foreground">
      <div className="draggle h-7 shrink-0" />
      <ErrorAlert className="mx-4 w-auto" />
      {settings.data ? <ReaderApp /> : (
        <AsyncState error={settings.isError} retry={() => settings.refetch()} />
      )}
    </main>
  )
}
