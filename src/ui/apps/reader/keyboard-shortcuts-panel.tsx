import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/ui/components/ui/dialog'
import { Kbd } from '@/ui/components/ui/kbd'
import { LocalizedDialogClose } from '@/ui/components/localized-dialog-close'

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
  ['f', 'f'],
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
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="undraggle max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)]"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{t('reader.keyboard.title')}</DialogTitle>
        </DialogHeader>
        <dl className="grid min-h-0 gap-3 overflow-y-auto">
          {shortcuts.map(([keys, text]) => (
            <div key={text} className="flex items-center justify-between gap-5">
              <dt className="text-sm text-muted-foreground">{t(`reader.keyboard.keys.${text}`)}</dt>
              <dd className="flex shrink-0 gap-1 text-xs">
                {keys.split(' ').map((key, index) => (
                  <span key={key}>
                    {index > 0 && <span className="mx-1 text-muted-foreground">{t('common.then')}</span>}
                    <Kbd>{key}</Kbd>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <LocalizedDialogClose />
      </DialogContent>
    </Dialog>
  )
}
