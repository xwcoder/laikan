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
import { RadioGroup, RadioGroupItem } from '@/ui/components/ui/radio-group'
import { Separator } from '@/ui/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from '@/ui/components/ui/dialog'
import { ErrorAlert } from '@/ui/components/error-alert'

function SettingsContent() {
  const { t } = useTranslation()
  const { data } = useSettings()
  const update = useUpdateSettings()
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
    <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-6" data-settings-body>
      <ErrorAlert />
      <section className="space-y-4" aria-labelledby="appearance-title">
        <div>
          <h2 id="appearance-title" className="font-semibold">
            {t('settings.appearance.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.appearance.description')}</p>
        </div>
        <RadioGroup
          aria-labelledby="appearance-title"
          value={data?.appearance}
          disabled={update.isPending}
          onValueChange={(value) => update.mutate({ path: 'appearance', value: value as Appearance })}
          className="grid-cols-3"
        >
          {(['light', 'dark', 'auto'] as const).map((value) => (
            <label
              htmlFor={`setting-${value}`}
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 has-[[data-state=checked]]:border-primary"
            >
              <RadioGroupItem
                id={`setting-${value}`}
                value={value}
                aria-label={t(`settings.appearance.${value}`)}
              />
              {t(`settings.appearance.${value}`)}
            </label>
          ))}
        </RadioGroup>
      </section>
      <Separator />
      <section className="space-y-4" aria-labelledby="locale-title">
        <div>
          <h2 id="locale-title" className="font-semibold">
            {t('settings.locale.title')}
          </h2>
          <p className="mt-1 text-muted-foreground">{t('settings.locale.description')}</p>
        </div>
        <RadioGroup
          aria-labelledby="locale-title"
          value={data?.locale}
          disabled={update.isPending}
          onValueChange={(value) => update.mutate({ path: 'locale', value: value as Locale })}
          className="grid-cols-2"
        >
          {languages.map(({ value, label }) => (
            <label
              htmlFor={`setting-${value}`}
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 has-[[data-state=checked]]:border-primary"
            >
              <RadioGroupItem id={`setting-${value}`} value={value} aria-label={label} />
              {label}
            </label>
          ))}
        </RadioGroup>
      </section>
      <Separator />
      <section className="space-y-4" aria-labelledby="path-title">
        <div>
          <h2 id="path-title" className="font-semibold">
            {t('settings.dataPath.title')}
          </h2>
          <p className="mt-1 text-muted-foreground">{t('settings.dataPath.description')}</p>
        </div>
        <div className="flex gap-2">
          <Input aria-labelledby="path-title" value={dataPath} readOnly />
          <Button variant="outline" disabled={browsing} onClick={browse}>
            <FolderOpen />
            {t('settings.dataPath.browserBtn')}
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
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
          size="icon"
          className="size-10 data-[state=open]:bg-accent"
          aria-label={t('common.settings')}
          data-settings-trigger
        >
          <SettingsIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[640px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <header className="space-y-2 px-6 pt-6 pb-5">
          <DialogTitle className="text-xl">{t('common.settings')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('settings.description')}
          </DialogDescription>
        </header>
        <SettingsContent />
      </DialogContent>
    </Dialog>
  )
}
