import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check, FolderOpen, LoaderCircle, Save, Settings as SettingsIcon,
} from 'lucide-react'
import { languages } from '@/i18n'
import { Appearance, Locale, Settings } from '@/types/settings'
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
import { normalizeRefreshInterval } from '@/base/common/refresh-interval'
import ThemeSelect from './theme-select'
import RefreshIntervalSelect from './refresh-interval-select'

const appearanceOptions: Appearance[] = ['light', 'dark', 'auto']
const optionsLayout = 'flex flex-wrap gap-x-4 gap-y-3'
const directoryFeedback = {
  idle: { Icon: Save, message: null },
  pending: { Icon: LoaderCircle, message: 'settings.dataPath.applying' },
  success: { Icon: Check, message: 'settings.dataPath.applied' },
  error: { Icon: Save, message: null },
}

function DataDirectorySettings({
  settings, update, savingSettings,
}: { settings?: Settings; update: ReturnType<typeof useUpdateSettings>; savingSettings: boolean }) {
  const { t } = useTranslation()
  const [draftPath, setDraftPath] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const activePath = settings?.dataPath ?? ''
  const defaultPath = settings?.defaultDataPath ?? ''
  const dataPath = draftPath ?? activePath
  const busy = browsing || savingSettings
  const { Icon, message } = directoryFeedback[update.status]

  const selectPath = (path: string) => {
    if (path === dataPath) return
    setDraftPath(path)
    if (update.isSuccess) update.reset()
  }

  const browse = async () => {
    setBrowsing(true)
    try {
      const result = await openDirectory({ properties: ['createDirectory'], defaultPath: dataPath })
      if (!result.canceled && result.filePaths[0]) selectPath(result.filePaths[0])
    } catch (error) {
      useAppStore.getState().setError((error as Error).message)
    } finally {
      setBrowsing(false)
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="path-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="path-title" className="font-medium">{t('settings.dataPath.title')}</h2>
        <Button
          variant="ghost"
          size="sm"
          data-directory-action="restore"
          disabled={busy || dataPath === defaultPath}
          onClick={() => selectPath(defaultPath)}
        >
          {t('settings.dataPath.setToDefaultBtn')}
        </Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[25rem]:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input
          aria-labelledby="path-title"
          value={dataPath}
          title={dataPath}
          className="truncate font-mono text-xs"
          readOnly
        />
        <Button variant="outline" data-directory-action="browse" disabled={busy} onClick={browse}>
          <FolderOpen />
          {t('settings.dataPath.browserBtn')}
        </Button>
        <Button
          className="col-span-full justify-self-end @min-[25rem]:col-span-1"
          data-directory-action="apply"
          aria-busy={update.isPending}
          disabled={busy || !dataPath || dataPath === activePath}
          onClick={() => {
            const app = useAppStore.getState()
            if (update.error?.message === app.error) app.setError(null)
            update.mutate({ path: 'dataPath', value: dataPath }, { onSuccess: () => setDraftPath(null) })
          }}
        >
          <Icon aria-hidden className={update.isPending ? 'motion-safe:animate-spin' : undefined} />
          {t('settings.dataPath.applyBtn')}
        </Button>
        <span className="sr-only" role="status">{message && t(message)}</span>
      </div>
    </section>
  )
}

function SettingsContent() {
  const { t } = useTranslation()
  const { data } = useSettings()
  const update = useUpdateSettings()
  const directoryUpdate = useUpdateSettings()
  const savingSettings = update.isPending || directoryUpdate.isPending
  const saving = update.isPending ? update.variables : undefined

  return (
    <div className="@container -mx-1 min-h-0 space-y-5 overflow-y-auto p-1" data-settings-body aria-busy={savingSettings}>
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
          {appearanceOptions.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`appearance-${value}`} value={value} />
              <Label htmlFor={`appearance-${value}`}>{t(`settings.appearance.${value}`)}</Label>
            </div>
          ))}
        </RadioGroup>
        <Label htmlFor="settings-theme" className="mt-2 @min-[25rem]:mt-0">
          {t('settings.theme.title')}
        </Label>
        <ThemeSelect
          value={saving?.path === 'theme' ? saving.value : data?.theme}
          onChange={(value) => update.mutate({ path: 'theme', value })}
        />
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
        <Label htmlFor="settings-refresh-interval" className="mt-2 @min-[25rem]:mt-0">
          {t('settings.refreshInterval.title')}
        </Label>
        <RefreshIntervalSelect
          value={saving?.path === 'reader.refreshInterval'
            ? saving.value
            : normalizeRefreshInterval(data?.reader?.refreshInterval)}
          onChange={(value) => update.mutate({ path: 'reader.refreshInterval', value })}
        />
      </div>
      <Separator />
      <DataDirectorySettings settings={data} update={directoryUpdate} savingSettings={savingSettings} />
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
          size="icon-sm"
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
