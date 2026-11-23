import {
  queryOptions, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query'
import * as settingsService from '@/services/settings/browser/settings'
import { ThemeId } from '@/base/common/themes'
import { normalizeLocale } from '@/i18n'
import { Appearance, Locale } from '@/types/settings'

export const settingsOptions = queryOptions({
  queryKey: ['settings'],
  networkMode: 'always',
  queryFn: async () => {
    const settings = await settingsService.get()
    return { ...settings, locale: normalizeLocale(settings.locale) }
  },
})

export const useSettings = () => useQuery(settingsOptions)

type SettingUpdate =
  | { path: 'appearance'; value: Appearance }
  | { path: 'theme'; value: ThemeId }
  | { path: 'locale'; value: Locale }
  | { path: 'dataPath'; value: string }
  | { path: 'reader.fontSize'; value: number }

export function useUpdateSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['settings', 'update'],
    networkMode: 'always',
    scope: { id: 'settings-write' },
    mutationFn: ({ path, value }: SettingUpdate) => settingsService.set(path, value),
    onSuccess: (_, update) => {
      if (update.path === 'reader.fontSize') {
        client.setQueryData(settingsOptions.queryKey, (settings) => settings && ({
          ...settings,
          reader: { ...settings.reader, fontSize: update.value },
        }))
      }
      return client.invalidateQueries({ queryKey: settingsOptions.queryKey })
    },
  })
}
