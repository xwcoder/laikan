import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen, Monitor, Moon, Settings as SettingsIcon, Sun,
} from 'lucide-react'
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

const themes = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'auto', Icon: Monitor },
] as const

const segmentedGroupClass = 'grid-flow-col auto-cols-fr gap-0.5 rounded-lg bg-muted p-1'

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
    <div className="@container min-h-0 space-y-5 overflow-y-auto px-6 pb-6" data-settings-body aria-busy={update.isPending}>
      <ErrorAlert />
      <div className="grid items-center gap-x-4 gap-y-2 @min-[24rem]:grid-cols-[1fr_17.5rem] @min-[24rem]:gap-y-4">
        <span id="appearance-title" className="font-medium">{t('settings.appearance.title')}</span>
        <RadioGroup
          aria-labelledby="appearance-title"
          orientation="horizontal"
          value={saving?.path === 'appearance' ? saving.value : data?.appearance}
          onValueChange={(value) => update.mutate({ path: 'appearance', value: value as Appearance })}
          className={segmentedGroupClass}
        >
          {themes.map(({ value, Icon }) => (
            <RadioGroupItem
              key={value}
              value={value}
              variant="segment"
            >
              <Icon aria-hidden className="size-3.5 shrink-0" />
              {t(`settings.appearance.${value}`)}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        <span id="locale-title" className="mt-2 font-medium @min-[24rem]:mt-0">
          {t('settings.locale.title')}
        </span>
        <RadioGroup
          aria-labelledby="locale-title"
          orientation="horizontal"
          value={saving?.path === 'locale' ? saving.value : data?.locale}
          onValueChange={(value) => update.mutate({ path: 'locale', value: value as Locale })}
          className={segmentedGroupClass}
        >
          {languages.map(({ value, label }) => (
            <RadioGroupItem key={value} value={value} lang={value} variant="segment">
              {label}
            </RadioGroupItem>
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
          size="icon"
          className="size-10 data-[state=open]:bg-accent"
          aria-label={t('common.settings')}
          data-settings-trigger
        >
          <SettingsIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <header className="space-y-1.5 px-6 pt-6 pb-5">
          <DialogTitle>{t('common.settings')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('settings.description')}
          </DialogDescription>
        </header>
        <SettingsContent />
      </DialogContent>
    </Dialog>
  )
}
