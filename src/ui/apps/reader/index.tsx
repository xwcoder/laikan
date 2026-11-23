import { useState } from 'react'
import { useReaderModel } from '@/ui/hooks/use-reader-model'
import SidePanel from './SidePanel'
import Article from './MainPanel/Article'
import List from './MainPanel/List'
import KeyboardShortcutsPanel from './keyboard-shortcuts-panel'
import useKeyboard from './use-keyboard'
import SettingsDialog from '../settings'

export default function Reader() {
  const model = useReaderModel()
  const [showKeyboard, setShowKeyboard] = useState(false)
  useKeyboard(model, showKeyboard, setShowKeyboard)

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="undraggle flex min-h-0 flex-col text-sidebar-foreground">
          <SidePanel key={model.libraryRevision} model={model} />
          <div className="shrink-0 px-4 pt-2 pb-4">
            <SettingsDialog />
          </div>
        </aside>
        <div className="undraggle min-h-0 min-w-0 pr-4 pb-4">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
            <List key={`${model.libraryRevision}:${model.tab}`} model={model} />
            {model.opened && <Article model={model} />}
          </div>
        </div>
      </div>
      <KeyboardShortcutsPanel open={showKeyboard} onOpenChange={setShowKeyboard} />
    </>
  )
}
