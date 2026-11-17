import { useState } from 'react'
import { useReaderModel } from '@/ui/hooks/use-reader-model'
import SidePanel from './SidePanel'
import Article from './MainPanel/Article'
import List from './MainPanel/List'
import KeyboardShortcutsPanel from './keyboard-shortcuts-panel'
import useKeyboard from './use-keyboard'

export default function Reader() {
  const model = useReaderModel()
  const [showKeyboard, setShowKeyboard] = useState(false)
  useKeyboard(model, showKeyboard, setShowKeyboard)

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="undraggle min-h-0 overflow-y-auto px-3 py-3">
          <SidePanel model={model} />
        </aside>
        <div className="undraggle min-h-0 min-w-0 pr-4 pb-4">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
            {model.opened ? <Article model={model} /> : <List model={model} />}
          </div>
        </div>
      </div>
      <KeyboardShortcutsPanel open={showKeyboard} onOpenChange={setShowKeyboard} />
    </>
  )
}
