export const defaultTheme = 'neutral'

export const neutralThemes = ['neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe'] as const

export const colorThemes = [
  'amber', 'blue', 'cyan', 'emerald', 'fuchsia', 'green', 'indigo', 'lime', 'orange',
  'pink', 'purple', 'red', 'rose', 'sky', 'teal', 'violet', 'yellow',
] as const

export type ThemeId = (typeof neutralThemes)[number] | (typeof colorThemes)[number]

const themeIds = new Set<unknown>([...neutralThemes, ...colorThemes])

export const isTheme = (value: unknown): value is ThemeId => themeIds.has(value)
