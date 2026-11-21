import { httpUrl } from './url'

const knownAliases = new Map<string, readonly string[]>([
  ['https://tech.meituan.com/rss.xml', ['https://tech.meituan.com/feed/', 'https://tech.meituan.com/feed']],
  ['https://blog.google/products-and-platforms/products/chrome/rss/', ['https://blog.google/products/chrome/rss/']],
  ['https://web.dev/static/blog/feed.xml', ['https://web.dev/feed.xml', 'https://web.dev/blog/feed.xml']],
  ['https://www.quantamagazine.org/feed/', ['https://api.quantamagazine.org/feed/']],
])
const canonicalUrls = new Map(
  [...knownAliases].flatMap(([url, aliases]) => aliases.map((alias) => [alias, url] as const)),
)

export function feedUrlKey(url: string) {
  const normalized = httpUrl(url) ?? url
  return canonicalUrls.get(normalized) ?? normalized
}

export function equivalentFeedUrls(url: string) {
  const key = feedUrlKey(url)
  return [...new Set([url, key, ...(knownAliases.get(key) ?? [])])]
}
