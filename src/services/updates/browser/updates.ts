import fetch from '@/base/browser/fetch'
import type { UpdateState } from '@/types/update'

export const getUpdateState = (): Promise<UpdateState> => fetch('/update/status')

export const installUpdate = (): Promise<void> => fetch('/update/install')
