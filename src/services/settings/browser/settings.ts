import fetch from '@/base/browser/fetch'
import { Settings } from '@/types/settings'

export const get = (): Promise<Settings & { libraryRevision: number }> => fetch('/settings/get')
export const set = (path: string, value: unknown): Promise<void> => fetch('/settings/set', { path, value })
