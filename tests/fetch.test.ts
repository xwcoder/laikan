import assert from 'node:assert/strict'
import {
  afterEach, beforeEach, mock, test,
} from 'node:test'
import { clearFeedCache, fetchFeed, parseURL } from '../src/base/node/feed/fetch'

const xml = '<rss version="2.0"><channel><title>Feed</title><item><title>One</title><link>post/one</link><description>Body</description></item></channel></rss>'
beforeEach(clearFeedCache)
afterEach(() => mock.restoreAll())

test('HTTP errors are rejected even if the body looks like RSS', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(xml, { status: 404 }))
  await assert.rejects(parseURL('https://example.com/feed'), { kind: 'http' })
})

test('a successful HTTP response with no body is distinct from a feed with no entries', async () => {
  const request = mock.method(globalThis, 'fetch', async () => new Response(''))
  const url = 'https://example.com/feed'
  await assert.rejects(parseURL(url), { kind: 'empty', message: /empty response \(HTTP 200\)/ })
  request.mock.mockImplementation(async () => new Response('<rss version="2.0"><channel><title>Feed</title></channel></rss>'))
  assert.deepEqual((await parseURL(url)).items, [])
  assert.equal(request.mock.callCount(), 2, 'An empty response must not be cached')
})

test('network errors keep the system error code in the diagnostic message', async () => {
  const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed', { cause }) })
  await assert.rejects(parseURL('https://example.com/feed'), { kind: 'network', message: /\(ECONNRESET\)/ })
})

test('preflight/import reuse a short-lived result and receive independent copies', async () => {
  const request = mock.method(globalThis, 'fetch', async () => new Response(xml))
  const first = await parseURL('https://example.com/feed')
  delete first.items
  const second = await parseURL('https://example.com/feed')
  assert.equal(second.items?.length, 1)
  assert.equal(request.mock.callCount(), 1)
  await fetchFeed('https://example.com/feed', { force: true })
  assert.equal(request.mock.callCount(), 2)
})

test('conditional requests send validators and accept an empty HTTP 304', async () => {
  const request = mock.method(
    globalThis,
    'fetch',
    async (
      _url: Parameters<typeof fetch>[0],
      options?: Parameters<typeof fetch>[1],
    ) => {
      const headers = new Headers(options?.headers)
      assert.equal(headers.get('if-none-match'), '"version-1"')
      assert.equal(headers.get('if-modified-since'), 'Wed, 18 Nov 2026 00:00:00 GMT')
      return new Response(null, { status: 304 })
    },
  )
  const result = await fetchFeed('https://example.com/feed', {
    etag: '"version-1"',
    lastModified: 'Wed, 18 Nov 2026 00:00:00 GMT',
  })
  assert.equal(result.status, 'not-modified')
  assert.equal(request.mock.callCount(), 1)
})

test('legacy encodings are decoded using HTTP metadata or the XML declaration', async () => {
  const body = Buffer.concat([
    Buffer.from('<?xml version="1.0" encoding="GBK"?><rss version="2.0"><channel><title>'),
    Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
    Buffer.from('</title></channel></rss>'),
  ])
  mock.method(globalThis, 'fetch', async () => new Response(body))
  assert.equal((await parseURL('https://example.com/gbk.xml')).title, '中文')
  mock.method(
    globalThis,
    'fetch',
    async () => new Response(body, { headers: { 'content-type': 'text/xml; charset=gbk' } }),
  )
  assert.equal((await parseURL('https://example.com/gbk-header.xml')).title, '中文')
})

test('UTF-16 BOM and final redirect URLs are respected', async () => {
  const body = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')])
  mock.method(globalThis, 'fetch', async () => {
    const response = new Response(body)
    Object.defineProperty(response, 'url', { value: 'https://example.com/new/feed.xml' })
    return response
  })
  const feed = await parseURL('https://example.com/old.xml')
  assert.equal(feed.items?.[0].url, 'https://example.com/new/post/one')
})

test('oversized streaming bodies are cancelled before parsing', async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(32))
    },
    cancel() {
      cancelled = true
    },
  })
  mock.method(globalThis, 'fetch', async () => new Response(body))
  await assert.rejects(fetchFeed('https://example.com/large', { maxBytes: 8 }), { kind: 'limit' })
  assert.equal(cancelled, true)
})

test('slow requests have a deadline and report a timeout error', async () => {
  mock.method(
    globalThis,
    'fetch',
    async (
      _url: Parameters<typeof fetch>[0],
      options?: Parameters<typeof fetch>[1],
    ) => new Promise<Response>((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
    }),
  )
  await assert.rejects(fetchFeed('https://example.com/slow', { timeoutMs: 10 }), { kind: 'timeout' })
})

test('request URL validation prevents non-web requests', async () => {
  const request = mock.method(globalThis, 'fetch', async () => new Response(xml))
  await assert.rejects(parseURL('file:///tmp/feed.xml'), { kind: 'format' })
  assert.equal(request.mock.callCount(), 0)
})
