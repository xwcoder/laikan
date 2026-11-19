import createDOMPurify from 'dompurify'
import { normalizeUrlAttribute } from '@/base/common/url'

export function articleContent(html: string, base?: string): string {
  const purify = createDOMPurify(window)
  // Also normalize legacy articles that were stored before URL normalization existed.
  purify.addHook('uponSanitizeAttribute', (_, data) => {
    const attribute = data
    const value = normalizeUrlAttribute(data.attrName, data.attrValue, base)
    if (value === null) attribute.keepAttr = false
    else if (value !== undefined) attribute.attrValue = value
  })
  return purify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'class', 'id'],
  })
}
