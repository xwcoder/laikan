import {
  queryOptions, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query'
import * as settingsService from '@/services/settings/browser/settings'
import { normalizeLocale } from '@/i18n'
import { Appearance, Locale } from '@/types/settings'

export const settingsOptions = queryOptions({
  queryKey: ['settings'],
  queryFn: async () => {
    const settings = await settingsService.get()
    return { ...settings, locale: normalizeLocale(settings.locale) }
  },
})

export const useSettings = () => useQuery(settingsOptions)

type SettingUpdate =
  | { path: 'appearance'; value: Appearance }
  | { path: 'locale'; value: Locale }
  | { path: 'dataPath'; value: string }
  | { path: 'reader.fontSize'; value: number }

export function useUpdateSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['settings', 'update'],
    scope: { id: 'settings-write' },
    mutationFn: ({ path, value }: SettingUpdate) => settingsService.set(path, value),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsOptions.queryKey }),
  })
}
