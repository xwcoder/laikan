import { setImmediate } from 'node:timers/promises'
import { SaxesParser, SaxesTagNS } from 'saxes'
import { FeedError } from './error'

export type XmlAttribute = { name: string; local: string; uri: string; value: string }
export type XmlElement = {
  name: string
  uri: string
  attributes: XmlAttribute[]
  children: (XmlElement | string)[]
  base?: string
  explicitBase?: boolean
}

export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
export const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom'
export const RSS_NAMESPACE = 'http://purl.org/rss/1.0/'
export const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

export function attribute(node: XmlElement, local: string, uri = '') {
  return node.attributes.find((attr) => attr.local === local && attr.uri === uri)?.value
}

export function children(node: XmlElement, name?: string, uri?: string): XmlElement[] {
  return node.children.filter((element): element is XmlElement => (
    typeof element !== 'string' && (name === undefined || element.name === name) && (uri === undefined || element.uri === uri)
  ))
}

export function child(node: XmlElement, name: string, uri = node.uri): XmlElement | undefined {
  return children(node, name, uri)[0]
}
export const text = (node: XmlElement | undefined): string => node?.children.map((value) => (typeof value === 'string' ? value : text(value))).join('') ?? ''

function xmlElement(tag: SaxesTagNS, parent: XmlElement | undefined, base?: string): XmlElement {
  const node: XmlElement = {
    name: tag.local,
    uri: tag.uri,
    attributes: Object.values(tag.attributes).map((attr) => ({
      name: attr.name,
      local: attr.local,
      uri: attr.uri,
      value: attr.value,
    })),
    children: [],
    base: parent?.base ?? base,
    explicitBase: parent?.explicitBase,
  }
  const xmlBase = attribute(node, 'base', XML_NAMESPACE)
  if (xmlBase) {
    try {
      node.base = new URL(xmlBase, node.base).href
      node.explicitBase = true
    } catch {
      /* Keep the inherited base. */
    }
  }
  return node
}

export async function parseXml(xml: string, base?: string): Promise<XmlElement> {
  if (Buffer.byteLength(xml) > 10 * 1024 * 1024) throw new FeedError('limit', 'Feed exceeds 10 MiB')
  const parser = new SaxesParser({ xmlns: true })
  const stack: XmlElement[] = []
  let root: XmlElement | undefined
  let nodes = 0
  const appendText = (value: string) => stack.at(-1)?.children.push(value)

  parser.on('opentag', (tag) => {
    nodes += 1
    if (nodes > 100_000 || stack.length >= 128) throw new FeedError('limit', 'XML structure is too large')
    const node = xmlElement(tag, stack.at(-1), base)
    if (stack.length) stack.at(-1)!.children.push(node)
    else root = node
    stack.push(node)
  })
  parser.on('text', appendText)
  parser.on('cdata', appendText)
  parser.on('closetag', () => {
    stack.pop()
  })
  try {
    for (let offset = 0; offset < xml.length; offset += 64 * 1024) {
      parser.write(xml.slice(offset, offset + 64 * 1024))
      // eslint-disable-next-line no-await-in-loop -- Preserve backpressure and ordered processing.
      await setImmediate()
    }
    parser.close()
  } catch (error) {
    if (error instanceof FeedError) throw error
    throw new FeedError('xml', `Invalid XML document (line ${parser.line}, column ${parser.column})`, { cause: error })
  }
  if (!root) throw new FeedError('xml', 'Empty XML document')
  return root
}
