import createDOMPurify from 'dompurify'
import { discardedArticleTags, hasArticleText, mediaSources } from '@/base/common/article-html'
import { externalUrl, httpUrl, normalizeUrlAttribute } from '@/base/common/url'

const targetAttribute = 'data-reader-target'
const emphasisAttribute = 'data-reader-emphasis'
const presentationalAttributes = [
  'align', 'autoplay', 'background', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class', 'clear',
  'color', 'face', 'hspace', 'id', 'name', 'noshade', 'nowrap', 'size', 'style', 'target', 'valign', 'vspace',
]
const inlineContainers = new Set(['a', 'b', 'em', 'font', 'i', 'label', 'p', 'span', 'strong'])

function emphasis(node: Element) {
  if (!inlineContainers.has(node.localName) || !node.hasAttribute('style')) return ''
  const { style } = (node as HTMLElement)
  if (!style) return ''
  const { fontWeight, fontStyle } = style
  const bold = fontWeight === 'bold' || fontWeight === 'bolder' || Number(fontWeight) >= 600
  const italic = fontStyle === 'italic' || fontStyle.startsWith('oblique')
  return [bold && 'strong', italic && 'em'].filter(Boolean).join(' ')
}

function recordFormatting(node: Element, base?: string) {
  if (node.nodeType !== 1) return
  // Only this hook may create the temporary attributes consumed below.
  node.removeAttribute(targetAttribute)
  node.removeAttribute(emphasisAttribute)
  const anchor = node.getAttribute('id') || (node.localName === 'a' && node.getAttribute('name'))
  if (anchor) node.setAttribute(targetAttribute, anchor)
  const tags = emphasis(node)
  if (tags) node.setAttribute(emphasisAttribute, tags)
  if (node.localName === 'img' || node.localName === 'source') {
    const { src, srcset } = mediaSources(node.localName, (name) => node.getAttribute(name) ?? undefined, base)
    if (src) node.setAttribute('src', src)
    if (srcset) node.setAttribute('srcset', srcset)
  }
}

function convertLegacyTags(root: Element) {
  for (const node of root.querySelectorAll('font, center, big')) {
    const replacement = root.ownerDocument.createElement(node.localName === 'center' ? 'div' : 'span')
    for (const attr of node.attributes) replacement.setAttribute(attr.name, attr.value)
    while (node.firstChild) replacement.append(node.firstChild)
    node.replaceWith(replacement)
  }
}

function applyEmphasis(root: Element) {
  for (const node of root.querySelectorAll(`[${emphasisAttribute}]`)) {
    const tags = node.getAttribute(emphasisAttribute)!.split(' ')
    node.removeAttribute(emphasisAttribute)
    const marks = tags.filter((tag) => (tag === 'strong' || tag === 'em') && node.localName !== tag)
    for (const tag of marks) {
      const wrapper = root.ownerDocument.createElement(tag)
      while (node.firstChild) wrapper.append(node.firstChild)
      node.append(wrapper)
    }
  }
}

const withoutFragment = (url: string) => url.split('#', 1)[0]

function localFragment(href: string, pages: Set<string>, base?: string) {
  if (href.startsWith('#')) return href.slice(1)
  const url = httpUrl(href, base)
  const fragment = url?.indexOf('#') ?? -1
  if (!url || fragment === -1 || !pages.has(withoutFragment(url))) return undefined
  return url.slice(fragment + 1)
}

function decodeFragment(fragment: string) {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function rewriteAnchors(root: Element, base: string | undefined, articleUrl: string | undefined) {
  const targets = new Map<string, string>()
  for (const node of root.querySelectorAll(`[${targetAttribute}]`)) {
    const original = node.getAttribute(targetAttribute)!
    node.removeAttribute(targetAttribute)
    if (!targets.has(original)) {
      const id = `reader-anchor-${targets.size}`
      node.id = id
      targets.set(original, id)
    }
  }

  const pages = new Set([httpUrl(base), httpUrl(articleUrl)].filter((url): url is string => !!url).map(withoutFragment))
  for (const link of root.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href')!
    const fragment = localFragment(href, pages, base)
    const target = fragment === undefined ? undefined : targets.get(decodeFragment(fragment)) ?? targets.get(fragment)
    if (target) {
      link.setAttribute('href', `#${target}`)
    } else if (href.startsWith('#')) {
      const external = externalUrl(href, httpUrl(articleUrl) ?? base)
      if (external) link.setAttribute('href', external)
      else link.removeAttribute('href')
    }
  }
}

function wrapTables(root: Element, label: string) {
  for (const table of root.querySelectorAll('table')) {
    const wrapper = root.ownerDocument.createElement('div')
    wrapper.className = 'article-table-scroll'
    wrapper.tabIndex = 0
    wrapper.setAttribute('role', 'region')
    wrapper.setAttribute('aria-label', label)
    table.replaceWith(wrapper)
    wrapper.append(table)
  }
}

type ContentOptions = { base?: string, articleUrl?: string, tableLabel: string }

export function articleContent(html: string, { base, articleUrl, tableLabel }: ContentOptions): string {
  const purify = createDOMPurify(window)
  purify.addHook('beforeSanitizeAttributes', (node) => recordFormatting(node, base))
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    const attribute = data
    const { attrName, attrValue } = attribute
    if (['width', 'height'].includes(attrName) && ['table', 'td', 'th', 'col', 'colgroup'].includes(node.localName)) {
      attribute.keepAttr = false
      return
    }
    const value = normalizeUrlAttribute(attrName, attrValue, base)
    if (value === null) attribute.keepAttr = false
    else if (value !== undefined) attribute.attrValue = value
  })
  const fragment = purify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: discardedArticleTags,
    ADD_FORBID_CONTENTS: discardedArticleTags,
    FORBID_ATTR: presentationalAttributes,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: [targetAttribute, emphasisAttribute, 'data-feed-text'],
  })
  const root = fragment.ownerDocument!.createElement('div')
  root.append(fragment)
  root.querySelectorAll('[hidden]').forEach((node) => node.remove())
  convertLegacyTags(root)
  applyEmphasis(root)
  rewriteAnchors(root, base, articleUrl)
  wrapTables(root, tableLabel)
  const media = root.querySelector('img[src], img[srcset], picture source[srcset], audio[src], video[src], video[poster], audio source[src], video source[src], svg')
  return hasArticleText(root.textContent ?? '') || media ? root.innerHTML : ''
}
