import fetch from '@/base/browser/fetch'
import { Feed, FeedRefreshResult } from '@/types/reader'
import { FeedError, FeedErrorKind } from '@/base/common/feed-error'

type ErrorReply = { error: FeedErrorKind }

export async function preflight(url: string): Promise<Feed | null> {
  const result: Feed | ErrorReply | null = await fetch('/reader/get/feed/preflight', url)
  if (result && 'error' in result) throw new FeedError(result.error, 'Unable to preview feed')
  return result
}

export const getAll = (): Promise<Feed[]> => fetch('/reader/get/feed/all')

export async function upsert(data: Pick<Feed, 'url' | 'title'>): Promise<void> {
  const result: ErrorReply | undefined = await fetch('/reader/post/feed', data)
  if (result?.error) throw new FeedError(result.error, 'Unable to subscribe to feed')
}

export const deleteById = (id: number): Promise<void> => fetch('/reader/delete/feed', id)

export const refreshAll = (): Promise<FeedRefreshResult> => fetch('/reader/post/feed/refresh')
