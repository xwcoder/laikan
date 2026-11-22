import fetch from '@/base/browser/fetch'
import {
  Feed, FeedRefreshResult, FeedTransferAction, FeedTransferResult,
} from '@/types/reader'
import { FeedError, FeedErrorKind } from '@/base/common/feed-error'

type ErrorReply = { error: FeedErrorKind }

export async function preflight(url: string): Promise<Feed | null> {
  const result: Feed | ErrorReply | null = await fetch('/reader/get/feed/preflight', url)
  if (result && 'error' in result) throw new FeedError(result.error, 'Unable to preview feed')
  return result
}

export const getAll = (revision: number): Promise<Feed[]> => fetch('/reader/get/feed/all', undefined, revision)

export async function upsert(data: Pick<Feed, 'url' | 'title'>, revision: number): Promise<void> {
  const result: ErrorReply | undefined = await fetch('/reader/post/feed', data, revision)
  if (result?.error) throw new FeedError(result.error, 'Unable to subscribe to feed')
}

export const unsubscribe = (id: number, revision: number): Promise<void> => fetch('/reader/delete/feed', id, revision)

export const refreshAll = (revision: number): Promise<FeedRefreshResult> => (
  fetch('/reader/post/feed/refresh', undefined, revision)
)

export const transfer = (action: FeedTransferAction, revision: number): Promise<FeedTransferResult> => (
  fetch(`/reader/post/feed/${action}`, undefined, revision)
)
