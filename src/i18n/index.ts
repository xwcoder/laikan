import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { Locale } from '@/types/settings'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

export const normalizeLocale = (locale: string): Locale => locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
export const languages = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
] as const

// Bundled resources are available synchronously, including in offline packaged builds.
i18n.use(initReactI18next).init({
  resources: { 'en-US': { translation: enUS }, 'zh-CN': { translation: zhCN } },
  lng: normalizeLocale(navigator.language),
  fallbackLng: 'en-US',
  supportedLngs: ['en-US', 'zh-CN'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export default i18n
