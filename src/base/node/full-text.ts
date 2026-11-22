import { MIMEType } from 'node:util'
import { legacyHookDecode } from '@exodus/bytes/encoding.js'
import sniffEncoding from 'html-encoding-sniffer'
import { FeedError } from '@/base/common/feed-error'
import { httpUrl } from '@/base/common/url'
import { ArticleFullText } from '@/types/reader'
import { escapeHtml, readableHtml } from './feed/html'
import { readBody } from './http-body'

const maxPageBytes = 3 * 1024 * 1024

export type ArticlePage = {
  html: string
  url: string
  mime: 'text/html' | 'application/xhtml+xml'
  directContent: boolean
}

function responseMime(header: string) {
  try {
    const type = new MIMEType(header)
    const mime = type.essence
    if (mime === 'text/html' || mime === 'application/xhtml+xml' || mime === 'text/plain') {
      return { mime, charset: type.params.get('charset') ?? undefined } as const
    }
  } catch {
    return undefined
  }
  return undefined
}

function plainPage(bytes: Uint8Array, header: string) {
  const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(header)?.[1]
  const text = new TextDecoder(charset ?? 'utf-8', { fatal: true }).decode(bytes)
  return `<div data-feed-text>${escapeHtml(text)}</div>`
}

function decodePage(bytes: Uint8Array, mime: ArticlePage['mime'], charset?: string) {
  const encoding = sniffEncoding(bytes, { xml: mime === 'application/xhtml+xml', transportLayerEncodingLabel: charset })
  return legacyHookDecode(bytes, encoding)
}

export async function fetchFullText(
  input: string,
  extractArticle: (page: ArticlePage) => Promise<string>,
  directContent = false,
): Promise<ArticleFullText> {
  const url = httpUrl(input)
  if (!url) throw new FeedError('format', 'Article URL must use HTTP or HTTPS')
  const response = await fetch(url, {
    headers: { Accept: 'text/html, application/xhtml+xml, text/plain;q=0.8' },
    credentials: 'omit',
    signal: AbortSignal.timeout(20_000),
  })
  const header = response.headers.get('content-type') ?? 'text/html'
  const type = responseMime(header)
  if (!response.ok || !type) {
    await response.body?.cancel()
    throw new FeedError('format', 'The original article did not return readable text or HTML')
  }
  const bytes = await readBody(response, maxPageBytes)
  const contentBase = httpUrl(response.url) ?? url
  const { mime, charset } = type
  const extracted = mime === 'text/plain' ? plainPage(bytes, header) : await extractArticle({
    html: decodePage(bytes, mime, charset),
    url: contentBase,
    mime,
    directContent,
  })
  const body = readableHtml(extracted, contentBase)
  if (!body) throw new FeedError('format', 'No article content was found on the original page')
  return { content: body.html, contentBase }
}
