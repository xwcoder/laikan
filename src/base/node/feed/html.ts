import {
  parseFragment, serialize, defaultTreeAdapter, DefaultTreeAdapterMap,
} from 'parse5'
import { httpUrl, normalizeUrlAttribute } from '@/base/common/url'
import {
  discardedArticleTags, hasArticleText, mediaSources, replacedMediaAttributes,
} from '@/base/common/article-html'
import { FeedError } from './error'
import { XmlElement } from './xml'

const htmlLimitMessage = 'HTML structure is too large'

export const escapeHtml = (value: string): string => value.replace(
  /[&<>"']/g,
  (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!,
)

export function serializeXml(node: XmlElement | string): string {
  if (typeof node === 'string') return escapeHtml(node)
  const attrs = node.attributes
    .filter((attr) => !attr.name.startsWith('xmlns'))
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join('')
  const opening = `<${node.name}${attrs}>`
  if (
    [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'source',
      'track',
      'wbr',
    ].includes(node.name)
  ) return opening
  return `${opening}${node.children.map(serializeXml).join('')}</${node.name}>`
}

type HtmlNode = DefaultTreeAdapterMap['childNode']

function htmlFragment(html: string) {
  let nodes = 0
  const depths = new WeakMap<object, number>()
  const allocate = () => {
    nodes += 1
    if (nodes > 100_000) throw new FeedError('limit', htmlLimitMessage)
  }
  const attach = (parent: DefaultTreeAdapterMap['parentNode'], node: HtmlNode) => {
    const depth = (depths.get(parent) ?? 0) + 1
    if (depth > 128) throw new FeedError('limit', htmlLimitMessage)
    depths.set(node, depth)
  }
  const adapter: typeof defaultTreeAdapter = {
    ...defaultTreeAdapter,
    createElement(...args) { allocate(); return defaultTreeAdapter.createElement(...args) },
    createCommentNode(...args) { allocate(); return defaultTreeAdapter.createCommentNode(...args) },
    appendChild(parent, node) { attach(parent, node); defaultTreeAdapter.appendChild(parent, node) },
    insertBefore(parent, node, reference) {
      attach(parent, node)
      defaultTreeAdapter.insertBefore(parent, node, reference)
    },
  }
  return parseFragment(html, { treeAdapter: adapter })
}

function walkHtml(nodes: HtmlNode[], visit: (node: HtmlNode, inheritedBase?: string) => void, base?: string) {
  const stack = nodes.map((node) => ({ node, base, depth: 0 }))
  let count = 0
  while (stack.length) {
    const current = stack.pop()!
    count += 1
    if (count > 100_000 || current.depth > 128) throw new FeedError('limit', htmlLimitMessage)
    const element = current.node
    const localBase = 'attrs' in element ? element.attrs.find((attr) => attr.name === 'xml:base')?.value : undefined
    const resolvedBase = httpUrl(localBase, current.base) ?? current.base
    visit(element, resolvedBase)
    if ('childNodes' in element) {
      for (const node of element.childNodes) stack.push({ node, base: resolvedBase, depth: current.depth + 1 })
    }
  }
}

function normalizeAttributes(node: HtmlNode, base?: string) {
  if (!('attrs' in node)) return
  const element = node
  const get = (name: string) => element.attrs.find((attr) => attr.name === name)?.value
  const attrs = element.attrs.flatMap((attr) => {
    const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name
    const value = normalizeUrlAttribute(name, attr.value, base)
    if (value === null) return []
    return [value === undefined ? attr : { ...attr, value }]
  })
  if (['img', 'source'].includes(element.tagName)) {
    const sources = mediaSources(element.tagName, get, base)
    element.attrs = attrs.filter((attr) => !replacedMediaAttributes.includes(attr.name))
    if (sources.src) element.attrs.push({ name: 'src', value: sources.src })
    if (sources.srcset) element.attrs.push({ name: 'srcset', value: sources.srcset })
  } else {
    element.attrs = attrs
  }
}

const blockTags = new Set([
  'address', 'blockquote', 'br', 'dd', 'div', 'dt', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p',
  'pre', 'section', 'td', 'th', 'tr',
])

function isMedia(node: DefaultTreeAdapterMap['element']): boolean {
  const hasSource = (element: DefaultTreeAdapterMap['element']) => element.attrs.some((attr) => (
    ['src', 'srcset', 'poster'].includes(attr.name) && attr.value
  ))
  if (node.tagName === 'img') return hasSource(node)
  if (node.tagName === 'svg') return node.childNodes.some((entry) => 'attrs' in entry)
  if (!['audio', 'video', 'picture'].includes(node.tagName)) return false
  return hasSource(node) || node.childNodes.some((entry) => 'attrs' in entry && hasSource(entry))
}

function visibleContent(nodes: HtmlNode[]) {
  const values: string[] = []
  let media = false
  const visit = (node: HtmlNode, depth: number) => {
    if (depth > 128) throw new FeedError('limit', htmlLimitMessage)
    if (node.nodeName === '#text' && 'value' in node) values.push(node.value)
    if (!('attrs' in node) || discardedArticleTags.includes(node.tagName)) return
    if (node.attrs.some((attr) => attr.name === 'hidden')) return
    const block = blockTags.has(node.tagName)
    if (block) values.push(' ')
    media ||= isMedia(node)
    node.childNodes.forEach((entry) => visit(entry, depth + 1))
    if (block) values.push(' ')
  }
  nodes.forEach((node) => visit(node, 0))
  return { text: values.join('').replace(/\s+/gu, ' ').trim(), media }
}

export function readableHtml(html: string, base?: string) {
  if (!html.trim()) return undefined
  const fragment = htmlFragment(html)
  walkHtml(fragment.childNodes, normalizeAttributes, base)
  const { text, media } = visibleContent(fragment.childNodes)
  if (!hasArticleText(text) && !media) return undefined
  return { html: serialize(fragment), text }
}

export function plainText(html: string): string {
  return visibleContent(htmlFragment(html).childNodes).text
}
