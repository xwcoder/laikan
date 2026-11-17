import fetch from '@/base/browser/fetch'
import { Feed } from '@/types/reader'

export const preflight = (url: string): Promise<Feed | null> => fetch('/reader/get/feed/preflight', url)
export const getAll = (): Promise<Feed[]> => fetch('/reader/get/feed/all')
export const upsert = (data: Pick<Feed, 'url' | 'title'>): Promise<void> => fetch('/reader/post/feed', data)
export const deleteById = (id: number): Promise<void> => fetch('/reader/delete/feed', id)
