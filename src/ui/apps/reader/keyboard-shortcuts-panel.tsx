import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/ui/components/ui/dialog'

const shortcuts = [
  ['?', 'sw'],
  ['g i', 'gi'],
  ['g s', 'gs'],
  ['g a', 'ga'],
  ['* a', 'selectAll'],
  ['* n', 'deselect'],
  ['x', 'x'],
  ['s', 's'],
  ['j', 'j'],
  ['k', 'k'],
  ['o', 'o'],
  ['u', 'u'],
  ['v', 'v'],
  ['Shift+i', 'shifti'],
  ['Shift+u', 'shiftu'],
] as const

export default function KeyboardShortcutsPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t('reader.keyboard.title')}</DialogTitle>
        <dl className="grid gap-3">
          {shortcuts.map(([keys, text]) => (
            <div key={text} className="flex items-center justify-between gap-5">
              <dt className="text-sm text-muted-foreground">{t(`reader.keyboard.keys.${text}`)}</dt>
              <dd className="flex shrink-0 gap-1 text-xs">
                {keys.split(' ').map((key, index) => (
                  <span key={key}>
                    {index > 0 && <span className="mx-1 text-muted-foreground">{t('common.then')}</span>}
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">{key}</kbd>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
