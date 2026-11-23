import { externalUrl } from '@/base/common/url'

export const openExternal = (value: string) => {
  const url = externalUrl(value)
  if (url) window.yikan.openExternal(url)
}

// eslint-disable-next-line max-len
export const openDirectory = (options: Parameters<typeof window.yikan.openDirectory>[0]) => window.yikan.openDirectory(options)
