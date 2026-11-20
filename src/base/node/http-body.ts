import { FeedError } from '@/base/common/feed-error'

export async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new FeedError('limit', 'Response body is too large')
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Preserve backpressure and ordered processing.
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) throw new FeedError('limit', 'Response body is too large')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}
