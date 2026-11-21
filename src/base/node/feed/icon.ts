import { parse, defaultTreeAdapter } from 'parse5'
import { httpUrl } from '@/base/common/url'
import { readBody } from '@/base/node/http-body'

export type FeedIconSource = { url: string; iconUrl?: string | null; websiteUrl?: string | null }
export type DecodeFeedIcon = (bytes: Uint8Array, mimeType: string) => Promise<Buffer | undefined>

const maxPageSize = 1024 * 1024
const maxIconSize = 512 * 1024
const imageTypes = 'image/png, image/jpeg, image/webp, image/svg+xml, image/x-icon, image/*, */*;q=0.1'

async function fetchAsset(url: string, accept: string, limit: number, signal: AbortSignal) {
  if (signal.aborted) return undefined
  try {
    const response = await fetch(url, { headers: { Accept: accept }, signal })
    if (!response.ok) {
      await response.body?.cancel()
      return undefined
    }
    return {
      bytes: await readBody(response, limit),
      type: response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '',
      url: httpUrl(response.url) ?? url,
    }
  } catch {
    return undefined
  }
}

function pageIconUrls(html: string, pageUrl: string) {
  const document = parse(html)
  const root = document.childNodes.find(defaultTreeAdapter.isElementNode)
  const elements = root?.childNodes.filter(defaultTreeAdapter.isElementNode) ?? []
  const head = elements.find(({ tagName }) => tagName === 'head')
  const tags = head?.childNodes.filter(defaultTreeAdapter.isElementNode) ?? []
  const base = tags.find(({ tagName }) => tagName === 'base')?.attrs.find(({ name }) => name === 'href')?.value
  const baseUrl = httpUrl(base, pageUrl) ?? pageUrl
  const links = tags.filter(({ tagName }) => tagName === 'link').flatMap(({ attrs }) => {
    const rel = attrs.find(({ name }) => name === 'rel')?.value.toLowerCase().split(/\s+/) ?? []
    const href = attrs.find(({ name }) => name === 'href')?.value
    return rel.some((value) => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'].includes(value))
      ? [httpUrl(href, baseUrl)] : []
  })
  return links.filter((url): url is string => !!url)
}

async function loadIcon(url: string, decode: DecodeFeedIcon, signal: AbortSignal) {
  const image = await fetchAsset(url, imageTypes, maxIconSize, signal)
  if (!image?.bytes.length) return undefined
  return decode(image.bytes, image.type).catch(() => undefined)
}

async function websiteIconUrls(website: string, signal: AbortSignal) {
  const page = await fetchAsset(website, 'text/html, application/xhtml+xml', maxPageSize, signal)
  const pageUrl = page?.url ?? website
  const links = page ? pageIconUrls(Buffer.from(page.bytes).toString('utf8'), pageUrl) : []
  const fallback = new URL('/favicon.ico', pageUrl).href
  return new Set([...new Set(links)].slice(0, 4).concat(fallback))
}

export async function fetchFeedIcon({ url, iconUrl, websiteUrl }: FeedIconSource, decode: DecodeFeedIcon) {
  const signal = AbortSignal.timeout(10_000)
  const declared = httpUrl(iconUrl ?? undefined)
  if (declared) {
    const icon = await loadIcon(declared, decode, signal)
    if (icon) return icon
  }
  const website = httpUrl(websiteUrl ?? undefined) ?? httpUrl('/', url)
  if (!website) return undefined
  const urls = await websiteIconUrls(website, signal)
  if (declared) urls.delete(declared)
  for (const candidate of urls) {
    // eslint-disable-next-line no-await-in-loop -- Try site icons in the order they are declared.
    const icon = await loadIcon(candidate, decode, signal)
    if (icon) return icon
  }
  return undefined
}
