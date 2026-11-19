import {
  parseFragment, serialize, defaultTreeAdapter, DefaultTreeAdapterMap,
} from 'parse5'
import { httpUrl, normalizeUrlAttribute } from '@/base/common/url'
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
      stack.push(
        ...element.childNodes.map((node) => ({ node, base: resolvedBase, depth: current.depth + 1 })),
      )
    }
  }
}

export function normalizeHtml(html: string, base?: string): string {
  const fragment = htmlFragment(html)
  walkHtml(
    fragment.childNodes,
    (node, inheritedBase) => {
      if (!('attrs' in node)) return
      // URL attributes are normalized before the renderer sanitizes and displays the HTML.
      const element = node
      element.attrs = element.attrs.flatMap((attr) => {
        const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name
        const value = normalizeUrlAttribute(name, attr.value, inheritedBase)
        if (value === null) return []
        return [value === undefined ? attr : { ...attr, value }]
      })
    },
    base,
  )
  return serialize(fragment)
}

export function plainText(html: string): string {
  const fragment = htmlFragment(html)
  const values: string[] = []
  // Ordered traversal keeps titles containing inline markup in their original order.
  const collect = (nodes: HtmlNode[], depth = 0) => {
    if (depth > 128) throw new FeedError('limit', htmlLimitMessage)
    for (const node of nodes) {
      if ('value' in node && node.nodeName === '#text') values.push(node.value)
      if ('childNodes' in node && !['script', 'style'].includes(node.nodeName)) collect(node.childNodes, depth + 1)
    }
  }
  collect(fragment.childNodes)
  return values.join('').trim()
}
