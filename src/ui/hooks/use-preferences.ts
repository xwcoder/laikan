import { useEffect, useState } from 'react'
import i18n from '@/i18n'
import { useSettings } from '@/ui/query/settings'

export function usePreferences() {
  const settings = useSettings()
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const appearance = settings.data?.appearance ?? 'auto'
  const dark = appearance === 'dark' || (appearance === 'auto' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const locale = settings.data?.locale
  useEffect(() => {
    if (locale) i18n.changeLanguage(locale)
  }, [locale])

  return settings
}
