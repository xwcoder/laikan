export function httpUrl(value: string | undefined, base?: string): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value.trim(), base)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export function externalUrl(value: string | undefined, base?: string): string | undefined {
  const http = httpUrl(value, base)
  if (http) return http
  try {
    const url = new URL(value ?? '', base)
    return url.protocol === 'mailto:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export function resourceUrl(value: string, base?: string): string | undefined {
  if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(value)) return value
  return httpUrl(value, base)
}

function srcsetCandidate(value: string, position: number) {
  let next = position
  while (next < value.length && /[\s,]/.test(value[next])) next += 1
  const start = next
  while (next < value.length && !/\s/.test(value[next])) next += 1
  const rawUrl = value.slice(start, next)
  if (rawUrl.endsWith(',')) return { rawUrl: rawUrl.replace(/,+$/, ''), descriptor: '', next }
  const descriptorStart = next
  while (next < value.length && value[next] !== ',') next += 1
  return { rawUrl, descriptor: value.slice(descriptorStart, next).trim(), next: next + 1 }
}

// Srcset URLs can contain commas (notably data URLs); split on descriptor boundaries.
export function normalizeSrcset(value: string, base?: string): string | undefined {
  const candidates: string[] = []
  let position = 0
  while (position < value.length) {
    const { rawUrl, descriptor, next } = srcsetCandidate(value, position)
    position = next
    const url = resourceUrl(rawUrl, base)
    const validSize = !descriptor || /^(?:\d+w|(?:\d*\.)?\d+x)$/.test(descriptor)
    if (url && validSize) candidates.push(descriptor ? `${url} ${descriptor}` : url)
  }
  return candidates.join(', ') || undefined
}

// Undefined means this is not a URL attribute; null means remove an unsafe URL.
export function normalizeUrlAttribute(name: string, value: string, base?: string): string | null | undefined {
  if (name === 'href') return value.trim().startsWith('#') ? value.trim() : externalUrl(value, base) ?? null
  if (name === 'srcset' || name === 'imagesrcset') return normalizeSrcset(value, base) ?? null
  if (['src', 'poster', 'background', 'xlink:href'].includes(name)) return resourceUrl(value, base) ?? null
  return undefined
}
