import { externalUrl } from '@/base/common/url'

export const openExternal = (value: string) => {
  const url = externalUrl(value)
  if (url) window.laikan.openExternal(url)
}

// eslint-disable-next-line max-len
export const openDirectory = (options: Parameters<typeof window.laikan.openDirectory>[0]) => window.laikan.openDirectory(options)
