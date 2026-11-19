import { setImmediate } from 'node:timers/promises'
import { Article, Feed } from '@/types/reader'
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
  escapeHtml, normalizeHtml, plainText, serializeXml,
} from './html'
import { articleIdentity } from './identity'
import { FeedError } from './error'

const value = (node: XmlElement, name: string) => text(child(node, name)).trim()

function atomText(node: XmlElement | undefined): string {
  if (!node) return ''
  return attribute(node, 'type') === 'html' ? plainText(text(node)) : text(node).trim()
}

function atomLink(node: XmlElement): string | undefined {
  const links = children(node, 'link').filter((link) => link.uri === node.uri && ['alternate', ''].includes(attribute(link, 'rel') ?? ''))
  const preferred = links.find((link) => ['text/html', 'application/xhtml+xml'].includes(attribute(link, 'type') ?? ''))
  for (const link of preferred ? [preferred, ...links] : links) {
    const url = httpUrl(attribute(link, 'href'), link.base)
    if (url) return url
  }
  return undefined
}

function rssLink(node: XmlElement): string | undefined {
  const links = children(node, 'link').filter((element) => element.uri !== ATOM_NAMESPACE)
  const link = links.find((element) => element.uri === node.uri) ?? links[0]
  const url = httpUrl(text(link), link?.base)
  if (url) return url
  const guid = child(node, 'guid')
  if (guid && attribute(guid, 'isPermaLink') !== 'false') return httpUrl(text(guid), guid.base)
  return httpUrl(attribute(node, 'about', RDF_NAMESPACE), node.base)
}

function date(node: XmlElement): string | undefined {
  for (const name of ['pubDate', 'published', 'updated', 'date', 'issued']) {
    const raw = value(node, name)
    const time = raw ? new Date(raw) : null
    if (time && !Number.isNaN(time.getTime())) return time.toISOString()
  }
  return undefined
}

function authors(node: XmlElement): string {
  const people = children(node).filter((element) => ['author', 'creator'].includes(element.name))
  return people
    .map((person) => value(person, 'name') || text(person).trim())
    .filter(Boolean)
    .join(', ')
}

function atomContent(node: XmlElement | undefined): string {
  if (!node || attribute(node, 'src')) return ''
  const type = (attribute(node, 'type') ?? 'text').toLowerCase()
  if (['html', 'text/html'].includes(type)) return text(node)
  if (['xhtml', 'application/xhtml+xml'].includes(type)) return node.children.map(serializeXml).join('')
  if (['text', 'text/plain'].includes(type)) return `<div data-feed-text>${escapeHtml(text(node))}</div>`
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
  const primary = child(node, atom ? 'content' : 'encoded')
  const summary = child(node, atom ? 'summary' : 'description')
  const read = atom ? atomContent : rssContent
  const body = read(primary)
  const chosen = body.trim() ? primary : summary
  return {
    raw: body.trim() ? body : read(summary),
    base: entryBase(node, chosen, atom, url, feedLink),
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
  const title = atom ? atomText(titleNode) : plainText(text(titleNode))
  const article: Article = {
    title: title || plainText(body.raw).slice(0, 120) || url,
    url,
    externalId: externalId(node, atom),
    content: normalizeHtml(body.raw, body.base),
    contentBase: httpUrl(body.base),
    pubTime: date(node),
    author: authors(node) || authors(channel),
  }
  article.identityKey = articleIdentity(article)
  return article
}

function channelFor(root: XmlElement): { channel: XmlElement; atom: boolean; entries: XmlElement[] } | null {
  if (root.name === 'feed' && ['', ATOM_NAMESPACE].includes(root.uri)) {
    return { channel: root, atom: true, entries: children(root, 'entry').filter((entry) => entry.uri === root.uri) }
  }
  const rdf = root.name === 'RDF' && root.uri === RDF_NAMESPACE
  if (root.name !== 'rss' && !rdf) return null
  const channel = child(root, 'channel')
  if (!channel) throw new FeedError('format', 'RSS channel is missing')
  const entries = rdf
    ? children(root, 'item').filter((node) => node.uri === RSS_NAMESPACE)
    : children(channel, 'item')
  return { channel, atom: false, entries }
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
    title: atom ? atomText(child(channel, 'title')) : plainText(value(channel, 'title')),
    description: atom ? atomText(child(channel, 'subtitle')) : plainText(value(channel, 'description')),
    link,
    items,
  }
}
