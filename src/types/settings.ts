import { ThemeId } from '@/base/common/themes'

export type Appearance = 'light' | 'dark' | 'auto'
export type Locale = 'en-US' | 'zh-CN'

export type Settings = {
  locale: Locale
  appearance: Appearance
  theme: ThemeId
  defaultDataPath: string
  dataPath: string
  reader?: { fontSize?: number }
}
