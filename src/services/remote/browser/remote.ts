import type { Listener } from '@/preload/index'

type Unsubscribe = () => void

const listeners = new Map<string, Map<Listener, Unsubscribe>>()

export const on = (ch: string, listener: Listener) => {
  const channelListeners = listeners.get(ch) ?? new Map<Listener, Unsubscribe>()
  const existing = channelListeners.get(listener)
  if (existing) {
    return existing
  }

  const unsubscribe = window.yikan.on(ch, listener)
  let active = true
  const remove = () => {
    if (!active) {
      return
    }

    active = false
    unsubscribe()
    channelListeners.delete(listener)
    if (channelListeners.size === 0) {
      listeners.delete(ch)
    }
  }

  channelListeners.set(listener, remove)
  listeners.set(ch, channelListeners)
  return remove
}

export const removeListener = (ch: string, listener: Listener) => listeners.get(ch)?.get(listener)?.()

export const addEventListener = on
