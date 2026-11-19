import { externalUrl } from '@/base/common/url'

export const openExternal = (value: string) => {
  const url = externalUrl(value)
  if (url) window.emo.openExternal(url)
}

// eslint-disable-next-line max-len
export const openDirectory = (options: Parameters<typeof window.emo.openDirectory>[0]) => window.emo.openDirectory(options)
