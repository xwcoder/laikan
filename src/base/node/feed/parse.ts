import { setImmediate } from 'node:timers/promises'
import { Article, ArticleContentSource, Feed } from '@/types/reader'
import { httpUrl } from '@/base/common/url'
import {
  ATOM_NAMESPACE,
  RDF_NAMESPACE,
  RSS_NAMESPACE,
  XmlElement,
  attribute,
  child,
  children,
  parseXml,
  text,
} from './xml'
import {
  escapeHtml, readableHtml, plainText, serializeXml,
} from './html'
import { articleIdentity } from './identity'
import { FeedError } from './error'
import { imageAttachments } from './media'

const contentNamespace = 'http://purl.org/rss/1.0/modules/content/'
const dcNamespace = 'http://purl.org/dc/elements/1.1/'
const dcTermsNamespace = 'http://purl.org/dc/terms/'
const htmlMimeType = 'text/html'
const xhtmlMimeType = 'application/xhtml+xml'
const value = (node: XmlElement, name: string, uri = node.uri) => text(child(node, name, uri)).trim()
const mimeType = (type: string) => type.split(';', 1)[0].trim().toLowerCase()

function readableBody(raw: string, base?: string) {
  try {
    return readableHtml(raw, base)
  } catch (error) {
    // An oversized body can fall back to the summary while the rest of the feed is imported.
    if (error instanceof FeedError && error.kind === 'limit') return undefined
    throw error
  }
}

function readableTitle(raw: string) {
  try {
    return plainText(raw)
  } catch (error) {
    if (error instanceof FeedError && error.kind === 'limit') return ''
    throw error
  }
}

function atomText(node: XmlElement | undefined): string {
  if (!node) return ''
  const type = mimeType(attribute(node, 'type') ?? 'text')
  if (['html', htmlMimeType].includes(type)) return readableTitle(text(node))
  if (['xhtml', xhtmlMimeType].includes(type)) return readableTitle(node.children.map(serializeXml).join(''))
  return text(node).trim()
}

function atomLink(node: XmlElement): string | undefined {
  const links = children(node, 'link', node.uri)
    .filter((item) => ['alternate', ''].includes(attribute(item, 'rel') ?? ''))
  const preferred = links.filter((item) => [htmlMimeType, xhtmlMimeType].includes(mimeType(attribute(item, 'type') ?? '')))
  return [...preferred, ...links].map((item) => httpUrl(attribute(item, 'href'), item.base)).find(Boolean)
}

function rssLink(node: XmlElement): string | undefined {
  const link = child(node, 'link')
  const url = httpUrl(text(link), link?.base)
  if (url) return url
  const guid = child(node, 'guid')
  const permalink = guid && attribute(guid, 'isPermaLink')?.toLowerCase() !== 'false' && httpUrl(text(guid))
  if (permalink) return permalink
  return httpUrl(attribute(node, 'about', RDF_NAMESPACE), node.base)
}

function date(node: XmlElement): string | undefined {
  const dates = ['pubDate', 'published', 'updated', 'date', 'issued'].map((name) => value(node, name))
  for (const raw of [...dates, value(node, 'date', dcNamespace), value(node, 'issued', dcTermsNamespace)]) {
    const time = raw ? new Date(raw) : null
    if (time && !Number.isNaN(time.getTime())) return time.toISOString()
  }
  return undefined
}

function authors(node: XmlElement): string {
  const people = [...children(node, 'author', node.uri), ...children(node, 'creator', dcNamespace)]
  return people
    .map((person) => value(person, 'name') || text(person).trim())
    .filter(Boolean)
    .join(', ')
}

function atomContent(node: XmlElement | undefined): string {
  if (!node || attribute(node, 'src')) return ''
  const type = mimeType(attribute(node, 'type') ?? 'text')
  if (['html', htmlMimeType].includes(type)) return text(node)
  if (['xhtml', xhtmlMimeType].includes(type)) return node.children.map(serializeXml).join('')
  if (type === 'text' || type.startsWith('text/')) return `<div data-feed-text>${escapeHtml(text(node))}</div>`
  return ''
}

function rssContent(node: XmlElement | undefined): string {
  if (!node) return ''
  return children(node).length ? node.children.map(serializeXml).join('') : text(node)
}

function entryBase(
  node: XmlElement,
  content: XmlElement | undefined,
  atom: boolean,
  url: string,
  feedLink?: string,
) {
  if (atom || content?.explicitBase) return content?.base ?? node.base
  return url || feedLink || node.base
}

function entryBody(node: XmlElement, atom: boolean, url: string, feedLink?: string) {
  const primary = atom ? child(node, 'content') : child(node, 'encoded', contentNamespace)
  const summary = child(node, atom ? 'summary' : 'description')
  const read = atom ? atomContent : rssContent
  const candidates: [XmlElement | undefined, ArticleContentSource][] = [[primary, 'full'], [summary, 'summary']]
  for (const [candidate, source] of candidates) {
    const base = entryBase(node, candidate, atom, url, feedLink)
    const body = readableBody(read(candidate), base)
    if (body) return { ...body, base, source }
  }
  const base = entryBase(node, undefined, atom, url, feedLink)
  const media = imageAttachments(node, atom)
  const source: ArticleContentSource = media ? 'media' : 'empty'
  return {
    html: media, text: '', base, source,
  }
}

function externalId(node: XmlElement, atom: boolean) {
  if (atom) return value(node, 'id') || undefined
  return value(node, 'guid') || attribute(node, 'about', RDF_NAMESPACE) || undefined
}

function parseEntry(node: XmlElement, channel: XmlElement, atom: boolean, feedLink?: string): Article {
  const url = (atom ? atomLink(node) : rssLink(node)) ?? ''
  const body = entryBody(node, atom, url, feedLink)
  const titleNode = child(node, 'title')
  const title = atom ? atomText(titleNode) : readableTitle(text(titleNode))
  const externalContent = atom ? child(node, 'content') : undefined
  const article: Article = {
    title: title || body.text.slice(0, 120) || url,
    url,
    externalId: externalId(node, atom),
    content: body.html,
    contentBase: httpUrl(body.base),
    contentSource: body.source,
    contentUrl: externalContent && httpUrl(attribute(externalContent, 'src'), externalContent.base),
    pubTime: date(node),
    author: authors(node) || authors(channel),
  }
  article.identityKey = articleIdentity(article)
  return article
}

function channelFor(root: XmlElement): { channel: XmlElement; atom: boolean; entries: XmlElement[] } | null {
  if (root.name === 'feed' && ['', ATOM_NAMESPACE].includes(root.uri)) {
    return { channel: root, atom: true, entries: children(root, 'entry', root.uri) }
  }
  const rdf = root.name === 'RDF' && root.uri === RDF_NAMESPACE
  if (root.name !== 'rss' && !rdf) return null
  const channel = child(root, 'channel', rdf ? RSS_NAMESPACE : root.uri)
  if (!channel) throw new FeedError('format', 'RSS channel is missing')
  const entries = rdf
    ? children(root, 'item', RSS_NAMESPACE)
    : children(channel, 'item', channel.uri)
  return { channel, atom: false, entries }
}

function feedIconUrl(root: XmlElement, channel: XmlElement, atom: boolean) {
  const resolve = (node: XmlElement | undefined) => httpUrl(text(node), node?.base)
  if (atom) return resolve(child(channel, 'icon')) ?? resolve(child(channel, 'logo'))
  const channelImage = child(channel, 'image')
  const rootImage = child(root, 'image', RSS_NAMESPACE)
  return (channelImage && resolve(child(channelImage, 'url')))
    ?? (rootImage && resolve(child(rootImage, 'url')))
    ?? (channelImage && httpUrl(attribute(channelImage, 'resource', RDF_NAMESPACE), channelImage.base))
}

export async function parseString(xml: string, base?: string): Promise<Omit<Feed, 'url'> | null> {
  const root = await parseXml(xml, base)
  const format = channelFor(root)
  if (!format) return null
  const { channel, atom, entries } = format
  if (entries.length > 5000) throw new FeedError('limit', 'Feed exceeds 5000 articles')
  const link = (atom ? atomLink(channel) : rssLink(channel)) ?? ''
  const items: Article[] = []
  for (const entry of entries) {
    items.push(parseEntry(entry, channel, atom, link))
    if (items.length % 32 === 0) {
      // eslint-disable-next-line no-await-in-loop -- Preserve ordered processing.
      await setImmediate()
    }
  }
  return {
    title: atom ? atomText(child(channel, 'title')) : readableTitle(value(channel, 'title')),
    description: atom ? atomText(child(channel, 'subtitle')) : readableTitle(value(channel, 'description')),
    link,
    iconUrl: feedIconUrl(root, channel, atom),
    items,
  }
}
