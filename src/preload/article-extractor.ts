import { contextBridge } from 'electron'
import { Readability } from '@mozilla/readability'
import { httpUrl } from '@/base/common/url'
import type { ArticlePage } from '@/base/node/full-text'

const parserErrorNamespace = 'http://www.mozilla.org/newlayout/xml/parsererror.xml'

function extractArticle({
  html, url, mime, directContent,
}: ArticlePage) {
  // The parsed document stays detached from the extractor page.
  const article = new DOMParser().parseFromString(html, mime)
  if (mime === 'application/xhtml+xml' && article.getElementsByTagNameNS(parserErrorNamespace, 'parsererror').length) {
    throw new Error('The original article returned malformed XHTML')
  }
  if (directContent) return article.body?.innerHTML ?? ''

  const base = httpUrl(article.querySelector('base[href]')?.getAttribute('href') ?? undefined, url) ?? url
  // DOMParser inherits the extractor page URL. Readability needs the original page URL and base.
  Object.defineProperties(article, {
    documentURI: { value: url },
    baseURI: { value: base },
  })
  return new Readability(article, { maxElemsToParse: 25_000, charThreshold: 200 }).parse()?.content ?? ''
}

contextBridge.exposeInMainWorld('extractArticle', extractArticle)
