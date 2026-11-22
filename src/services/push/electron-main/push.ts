import { logger } from '@/services/logger/electron-main/logger'
import { Window } from '../../window/electron-main/window'

let window: Window

export const createPushChannel = (win: Window) => { window = win }

export const push = (ch: string, data: any) => {
  const target = window?.window
  if (!target || target.isDestroyed()) return
  try {
    target.webContents.send(ch, data)
  } catch (error) {
    logger.warn(`[Push] Unable to send ${ch}`, error)
  }
}
