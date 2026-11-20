import { Readability } from '@mozilla/readability'
import { FeedError } from '@/base/common/feed-error'
import { httpUrl } from '@/base/common/url'
import { ArticleFullText } from '@/types/reader'
import { escapeHtml, readableHtml } from './feed/html'
import { readBody } from './http-body'

const maxPageBytes = 3 * 1024 * 1024

async function extractPage(bytes: Uint8Array, url: string, type: string, directContent: boolean) {
  const mime = type.split(';', 1)[0].trim().toLowerCase()
  if (mime === 'text/plain') {
    const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(type)?.[1]
    const text = new TextDecoder(charset ?? 'utf-8', { fatal: true }).decode(bytes)
    return `<div data-feed-text>${escapeHtml(text)}</div>`
  }

  // Default JSDOM options disable scripts and subresource fetching.
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(Buffer.from(bytes), { url, contentType: type })
  try {
    const { document } = dom.window
    if (directContent) return document.body?.innerHTML ?? ''
    const article = new Readability(document, { maxElemsToParse: 25_000, charThreshold: 200 }).parse()
    return article?.content ?? ''
  } finally {
    dom.window.close()
  }
}

export async function fetchFullText(input: string, directContent = false): Promise<ArticleFullText> {
  const url = httpUrl(input)
  if (!url) throw new FeedError('format', 'Article URL must use HTTP or HTTPS')
  const response = await fetch(url, {
    headers: { Accept: 'text/html, application/xhtml+xml, text/plain;q=0.8' },
    credentials: 'omit',
    signal: AbortSignal.timeout(20_000),
  })
  const type = response.headers.get('content-type') ?? 'text/html'
  if (!response.ok || !/^(text\/html|application\/xhtml\+xml|text\/plain)(\s*;|$)/i.test(type.trim())) {
    await response.body?.cancel()
    throw new FeedError('format', 'The original article did not return readable text or HTML')
  }
  const bytes = await readBody(response, maxPageBytes)
  const contentBase = httpUrl(response.url) ?? url
  const extracted = await extractPage(bytes, contentBase, type, directContent)
  const body = readableHtml(extracted, contentBase)
  if (!body) throw new FeedError('format', 'No article content was found on the original page')
  return { content: body.html, contentBase }
}
