import { httpUrl } from '@/base/common/url'
import { escapeHtml } from './html'
import { XmlElement, attribute, children } from './xml'

const mediaNamespace = 'http://search.yahoo.com/mrss/'
const imageType = (value?: string) => /^image\//i.test(value ?? '')

function enclosureImages(node: XmlElement, atom: boolean) {
  const enclosures = children(node, atom ? 'link' : 'enclosure', node.uri)
  return enclosures.filter((entry) => imageType(attribute(entry, 'type')) && (!atom || attribute(entry, 'rel') === 'enclosure'))
    .map((entry) => httpUrl(attribute(entry, atom ? 'href' : 'url'), entry.base))
}

function mediaImages(node: XmlElement) {
  const containers = [node, ...children(node, 'group', mediaNamespace)]
  const images = containers.flatMap((container) => children(container, 'content', mediaNamespace))
    .filter((entry) => attribute(entry, 'medium') === 'image' || imageType(attribute(entry, 'type')))
    .map((entry) => httpUrl(attribute(entry, 'url'), entry.base)).filter(Boolean)
  if (images.length) return images
  return containers.flatMap((container) => children(container, 'thumbnail', mediaNamespace))
    .map((entry) => httpUrl(attribute(entry, 'url'), entry.base))
}

export function imageAttachments(node: XmlElement, atom: boolean) {
  const enclosed = enclosureImages(node, atom).filter(Boolean)
  const images = enclosed.length ? enclosed : mediaImages(node)
  return [...new Set(images)].filter((url): url is string => !!url)
    .map((url) => `<figure><img src="${escapeHtml(url)}" alt=""></figure>`).join('')
}
