import {
  useEffect, useRef, Dispatch, SetStateAction,
} from 'react'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { openExternal } from '@/base/browser/shell'
import { useAppStore } from '@/ui/store'

const isEditing = (event: KeyboardEvent) => event.isComposing
  || event.metaKey
  || event.ctrlKey
  || event.altKey
  || !!(event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')

const shouldIgnore = (event: KeyboardEvent, showHelp: boolean) => isEditing(event)
  || (!showHelp && !!document.querySelector('[role="dialog"]'))

function getActions(model: ReaderModel) {
  const actions: Record<string, () => unknown> = {
    j: () => model.move(1),
    k: () => model.move(-1),
    o: () => model.activeId !== null && model.open(model.activeId),
    u: model.fold,
    s: () => model.toggleStar(),
    v: () => model.opened && model.activeArticle && openExternal(model.activeArticle.url),
    x: () => model.activeId !== null && model.toggleSelected(model.activeId),
    'shift+i': () => model.markRead(1),
    'shift+u': () => model.markRead(0),
    gi: () => model.changeTab('unread'),
    gs: () => model.changeTab('starred'),
    ga: () => model.changeTab('all'),
    '*a': () => model.select(model.articles.map((article) => article.id!)),
    '*n': () => model.select([]),
  }
  return actions
}

const run = (action: () => unknown) => {
  Promise.resolve()
    .then(action)
    .catch((error: Error) => useAppStore.getState().setError(error.message))
}

const shortcutKey = (sequence: string, event: KeyboardEvent) => {
  const key = event.key.toLowerCase()
  return sequence ? `${sequence}${key}` : event.shiftKey ? `shift+${key}` : key
}

export default function useKeyboard(
  model: ReaderModel,
  showHelp: boolean,
  setHelp: Dispatch<SetStateAction<boolean>>,
) {
  const modelRef = useRef(model)
  const helpRef = useRef(showHelp)
  modelRef.current = model
  helpRef.current = showHelp

  useEffect(() => {
    let sequence = ''
    let timer: ReturnType<typeof setTimeout>
    const clear = () => {
      sequence = ''
    }
    const keydown = (event: KeyboardEvent) => {
      if (shouldIgnore(event, helpRef.current)) {
        clear()
        return
      }
      if (event.key === '?') {
        event.preventDefault()
        setHelp((value) => !value)
        return
      }
      if (helpRef.current) return
      const key = event.key.toLowerCase()
      const actions = getActions(modelRef.current)
      if (key === 'g' || key === '*') {
        sequence = key
        clearTimeout(timer)
        timer = setTimeout(clear, 700)
        event.preventDefault()
        return
      }
      const shortcut = shortcutKey(sequence, event)
      clear()
      if (actions[shortcut]) {
        event.preventDefault()
        run(actions[shortcut])
      }
    }
    document.addEventListener('keydown', keydown)
    window.addEventListener('blur', clear)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', clear)
    }
  }, [setHelp])
}
