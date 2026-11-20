import { normalizeSrcset, resourceUrl } from './url'

export const discardedArticleTags = [
  'base', 'button', 'embed', 'form', 'head', 'iframe', 'input', 'link', 'meta', 'noscript', 'object',
  'script', 'select', 'style', 'template', 'textarea', 'title',
]

export const hasArticleText = (text: string) => /[^\s\u200b-\u200d\u2060\ufeff]/u.test(text)

type ReadAttribute = (name: string) => string | undefined

const lazySources = ['data-src', 'data-original', 'data-lazy-src']
const lazySrcsets = ['data-srcset', 'data-lazy-srcset']
export const replacedMediaAttributes = ['src', 'srcset', ...lazySources, ...lazySrcsets]

export function mediaSources(tag: string, get: ReadAttribute, base?: string) {
  const srcNames = tag === 'img' ? [...lazySources, 'src'] : ['src']
  const src = srcNames.map((name) => resourceUrl(get(name) ?? '', base)).find(Boolean)
  const srcset = [...lazySrcsets, 'srcset']
    .map((name) => normalizeSrcset(get(name) ?? '', base)).find(Boolean)
  return { src, srcset }
}
