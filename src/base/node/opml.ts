import { FeedError } from '@/base/common/feed-error'
import { httpUrl } from '@/base/common/url'
import { Feed } from '@/types/reader'
import {
  attribute, child, children, parseXml, XmlElement,
} from './feed/xml'
import { decodeXml } from './xml-encoding'

function collectSubscriptions(container: XmlElement, feeds: Feed[]) {
  for (const outline of children(container, 'outline', container.uri)) {
    const url = httpUrl(attribute(outline, 'xmlUrl'))
    if (url) {
      feeds.push({
        url,
        title: attribute(outline, 'title')?.trim() || attribute(outline, 'text')?.trim() || url,
        link: httpUrl(attribute(outline, 'htmlUrl')),
        description: attribute(outline, 'description'),
      })
    }
    collectSubscriptions(outline, feeds)
  }
}

export async function parseOpml(bytes: Uint8Array): Promise<Feed[]> {
  let xml: string
  try {
    xml = decodeXml(bytes)
  } catch (error) {
    throw new FeedError('encoding', 'OPML character encoding is invalid or unsupported', { cause: error })
  }
  const root = await parseXml(xml)
  const body = child(root, 'body')
  if (root.name !== 'opml' || !body) throw new FeedError('format', 'Expected an OPML document with a body')
  const feeds: Feed[] = []
  collectSubscriptions(body, feeds)
  return feeds
}

const xmlAttributeEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
}

function xmlAttribute(value: string) {
  // A locally entered title can contain characters that XML 1.0 cannot represent.
  // eslint-disable-next-line no-control-regex
  const valid = value.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '\uFFFD')
  return `"${valid.replace(/[&<>"'\t\n\r]/g, (character) => xmlAttributeEscapes[character])}"`
}

function serializeOutline({
  title, url, link, description,
}: Feed) {
  const attributes = {
    type: 'rss',
    text: title,
    title,
    xmlUrl: url,
    ...(link && { htmlUrl: link }),
    ...(description && { description }),
  }
  const serialized = Object.entries(attributes).map(([name, value]) => `${name}=${xmlAttribute(value)}`).join(' ')
  return `    <outline ${serialized}/>`
}

export function serializeOpml(feeds: readonly Feed[]) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>一刊订阅</title>',
    '  </head>',
    '  <body>',
    ...feeds.map(serializeOutline),
    '  </body>',
    '</opml>',
    '',
  ].join('\n')
}
