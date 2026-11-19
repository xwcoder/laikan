import { Feed } from '@/types/reader'
import { httpUrl } from '@/base/common/url'
import { parseString } from './parse'
import { FeedError } from './error'

type Validators = { etag?: string; lastModified?: string }
export type FetchOptions = Validators & { force?: boolean; timeoutMs?: number; maxBytes?: number }
export type FetchResult = Validators & ({ status: 'modified'; feed: Feed } | { status: 'not-modified' })

const maxBodySize = 10 * 1024 * 1024
const cacheTtl = 30_000
const cache = new Map<string, { feed: Feed; storedAt: number }>()
const inFlight = new Map<string, Promise<FetchResult>>()

export function clearFeedCache() {
  cache.clear()
}

function byteOrder(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  return undefined
}

function encoding(bytes: Uint8Array, contentType: string): string {
  const declared = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1]
  const bom = byteOrder(bytes)
  if (bom || declared) return (bom ?? declared)!
  if (bytes[0] === 0 && bytes[1] === 0x3c) return 'utf-16be'
  if (bytes[0] === 0x3c && bytes[1] === 0) return 'utf-16le'
  const declaration = new TextDecoder('ascii').decode(bytes.subarray(0, 1024))
  return /<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i.exec(declaration)?.[1] ?? 'utf-8'
}

function decode(bytes: Uint8Array, contentType: string): string {
  try {
    return new TextDecoder(encoding(bytes, contentType), { fatal: true }).decode(bytes)
  } catch (error) {
    throw new FeedError('encoding', 'Feed character encoding is invalid or unsupported', { cause: error })
  }
}

async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new FeedError('limit', 'Feed response is too large')
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Preserve backpressure and ordered processing.
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) throw new FeedError('limit', 'Feed response is too large')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

function remember(url: string, feed: Feed) {
  cache.delete(url)
  cache.set(url, { feed, storedAt: Date.now() })
  while (cache.size > 8) cache.delete(cache.keys().next().value!)
}

function requestHeaders(options: FetchOptions) {
  const headers = new Headers({
    Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*;q=0.1',
  })
  if (options.etag) headers.set('If-None-Match', options.etag)
  if (options.lastModified) headers.set('If-Modified-Since', options.lastModified)
  return headers
}

async function modifiedResponse(response: Response, url: string, maxBytes: number): Promise<FetchResult> {
  const bytes = await readBody(response, maxBytes)
  const parsed = await parseString(
    decode(bytes, response.headers.get('content-type') ?? ''),
    httpUrl(response.url) ?? url,
  )
  if (!parsed) throw new FeedError('format', 'Unsupported RSS or Atom document')
  const feed: Feed = {
    ...parsed,
    url,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  }
  return {
    status: 'modified', feed, etag: feed.etag, lastModified: feed.lastModified,
  }
}

async function parseResponse(response: Response, url: string, options: FetchOptions): Promise<FetchResult> {
  if (response.status === 304) {
    if (!options.etag && !options.lastModified) throw new FeedError('http', 'Unexpected HTTP 304 response')
    return {
      status: 'not-modified',
      etag: response.headers.get('etag') ?? options.etag,
      lastModified: response.headers.get('last-modified') ?? options.lastModified,
    }
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new FeedError('http', `Feed request failed (HTTP ${response.status})`)
  }
  return modifiedResponse(response, url, options.maxBytes ?? maxBodySize)
}

async function requestFeed(url: string, options: FetchOptions): Promise<FetchResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000)
  try {
    const response = await fetch(url, { headers: requestHeaders(options), signal: controller.signal })
    const result = await parseResponse(response, url, options)
    controller.signal.throwIfAborted()
    if (result.status === 'modified') remember(url, result.feed)
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new FeedError('timeout', 'Feed request timed out', { cause: error })
    if (error instanceof FeedError) throw error
    throw new FeedError('network', 'Unable to fetch feed', { cause: error })
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchFeed(input: string, options: FetchOptions = {}): Promise<FetchResult> {
  const url = httpUrl(input)
  if (!url) throw new FeedError('format', 'Feed URL must use HTTP or HTTPS')
  const cached = cache.get(url)
  if (
    !options.force
    && !options.etag
    && !options.lastModified
    && cached
    && Date.now() - cached.storedAt < cacheTtl
  ) {
    return {
      status: 'modified',
      feed: structuredClone(cached.feed),
      etag: cached.feed.etag,
      lastModified: cached.feed.lastModified,
    }
  }
  const key = JSON.stringify([url, options])
  let pending = inFlight.get(key)
  if (!pending) {
    pending = requestFeed(url, options).finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
  }
  return structuredClone(await pending)
}

export async function parseURL(url: string, options?: FetchOptions): Promise<Feed> {
  const result = await fetchFeed(url, options)
  if (result.status !== 'modified') throw new FeedError('http', 'Feed content was not returned')
  return result.feed
}
