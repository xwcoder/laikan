import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Settings as SettingsIcon } from 'lucide-react'
import { languages } from '@/i18n'
import { Appearance, Locale } from '@/types/settings'
import { useSettings, useUpdateSettings } from '@/ui/query/settings'
import { useAppStore } from '@/ui/store'
import { openDirectory } from '@/base/browser/shell'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/ui/components/ui/radio-group'
import { Separator } from '@/ui/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/ui/components/ui/dialog'
import { ErrorAlert } from '@/ui/components/error-alert'
import { LocalizedDialogClose } from '@/ui/components/localized-dialog-close'

const themes: Appearance[] = ['light', 'dark', 'auto']
const optionsLayout = 'flex flex-wrap gap-x-4 gap-y-3'

function SettingsContent() {
  const { t } = useTranslation()
  const { data } = useSettings()
  const update = useUpdateSettings()
  const saving = update.isPending ? update.variables : undefined
  const [draftPath, setDraftPath] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const dataPath = draftPath ?? data?.dataPath ?? ''

  const browse = async () => {
    setBrowsing(true)
    try {
      const result = await openDirectory({ properties: ['createDirectory'], defaultPath: dataPath })
      if (!result.canceled && result.filePaths[0]) setDraftPath(result.filePaths[0])
    } catch (error) {
      useAppStore.getState().setError((error as Error).message)
    } finally {
      setBrowsing(false)
    }
  }

  return (
    <div className="@container -mx-1 min-h-0 space-y-5 overflow-y-auto p-1" data-settings-body aria-busy={update.isPending}>
      <ErrorAlert />
      <div className="grid items-center gap-x-4 gap-y-3 @min-[25rem]:grid-cols-[1fr_17.5rem] @min-[25rem]:gap-y-5">
        <span id="appearance-title" className="font-medium">{t('settings.appearance.title')}</span>
        <RadioGroup
          aria-labelledby="appearance-title"
          orientation="horizontal"
          value={saving?.path === 'appearance' ? saving.value : data?.appearance}
          onValueChange={(value) => update.mutate({ path: 'appearance', value: value as Appearance })}
          className={optionsLayout}
        >
          {themes.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`appearance-${value}`} value={value} />
              <Label htmlFor={`appearance-${value}`}>{t(`settings.appearance.${value}`)}</Label>
            </div>
          ))}
        </RadioGroup>
        <span id="locale-title" className="mt-2 font-medium @min-[25rem]:mt-0">
          {t('settings.locale.title')}
        </span>
        <RadioGroup
          aria-labelledby="locale-title"
          orientation="horizontal"
          value={saving?.path === 'locale' ? saving.value : data?.locale}
          onValueChange={(value) => update.mutate({ path: 'locale', value: value as Locale })}
          className={optionsLayout}
        >
          {languages.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`locale-${value}`} value={value} lang={value} />
              <Label htmlFor={`locale-${value}`} lang={value}>{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <Separator />
      <section className="space-y-3" aria-labelledby="path-title">
        <div className="space-y-1">
          <h2 id="path-title" className="font-medium">{t('settings.dataPath.title')}</h2>
          <p id="path-description" className="text-sm text-muted-foreground">{t('settings.dataPath.description')}</p>
        </div>
        <div className="flex gap-2">
          <Input
            aria-labelledby="path-title"
            aria-describedby="path-description"
            value={dataPath}
            title={dataPath}
            className="truncate font-mono text-xs"
            readOnly
          />
          <Button variant="outline" disabled={browsing} onClick={browse}>
            <FolderOpen />
            {t('settings.dataPath.browserBtn')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={dataPath === data?.defaultDataPath || update.isPending}
            onClick={() => setDraftPath(data?.defaultDataPath ?? '')}
          >
            {t('settings.dataPath.setToDefaultBtn')}
          </Button>
          <Button
            disabled={!dataPath || dataPath === data?.dataPath || update.isPending}
            onClick={() => update.mutate({ path: 'dataPath', value: dataPath })}
          >
            {t('settings.dataPath.applyBtn')}
          </Button>
        </div>
      </section>
    </div>
  )
}

export default function SettingsDialog() {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={t('common.settings')}
          data-settings-trigger
        >
          <SettingsIcon />
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="undraggle max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t('common.settings')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <SettingsContent />
        <LocalizedDialogClose />
      </DialogContent>
    </Dialog>
  )
}
