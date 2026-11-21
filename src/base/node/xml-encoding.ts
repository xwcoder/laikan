function byteOrder(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  return undefined
}

function encoding(bytes: Uint8Array, contentType: string): string {
  const declared = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1]
  const bom = byteOrder(bytes)
  if (bom || declared) return (bom ?? declared)!
  if (bytes[0] === 0 && bytes[1] === 0x3c) return 'utf-16be'
  if (bytes[0] === 0x3c && bytes[1] === 0) return 'utf-16le'
  const declaration = new TextDecoder('ascii').decode(bytes.subarray(0, 1024))
  return /<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i.exec(declaration)?.[1] ?? 'utf-8'
}

export function decodeXml(bytes: Uint8Array, contentType = '') {
  return new TextDecoder(encoding(bytes, contentType), { fatal: true }).decode(bytes)
}
