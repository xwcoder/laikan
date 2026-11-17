export type Appearance = 'light' | 'dark' | 'auto'
export type Locale = 'en-US' | 'zh-CN'

export type Settings = {
  locale: Locale
  appearance: Appearance
  defaultDataPath: string
  dataPath: string
  reader?: { fontSize?: number }
}
