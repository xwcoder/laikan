import {
  BookOpen, Settings, Moon, Sun,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/ui/store'
import { useSettings, useUpdateSettings } from '@/ui/query/settings'
import { Button } from '@/ui/components/ui/button'
import { cn } from '@/ui/lib/utils'

export default function Nav() {
  const { t } = useTranslation()
  const { app, changeApp } = useAppStore()
  const settings = useSettings()
  const update = useUpdateSettings()
  const dark = settings.data?.appearance === 'dark'
    || (settings.data?.appearance === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <nav aria-label="emo" className="draggle flex h-screen flex-col items-center gap-3 border-r pt-12 pb-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('common.reader')}
        data-nav="reader"
        aria-pressed={app === 'reader'}
        className={cn('undraggle size-10', app === 'reader' && 'bg-accent text-primary')}
        onClick={() => changeApp('reader')}
      >
        <BookOpen />
      </Button>
      <div className="undraggle mt-auto flex flex-col gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('common.toggleTheme')}
          disabled={!settings.data || update.isPending}
          onClick={() => update.mutate({ path: 'appearance', value: dark ? 'light' : 'dark' })}
        >
          {dark ? <Sun /> : <Moon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('common.settings')}
          data-nav="settings"
          aria-pressed={app === 'settings'}
          className={cn('size-10', app === 'settings' && 'bg-accent text-primary')}
          onClick={() => changeApp('settings')}
        >
          <Settings />
        </Button>
      </div>
    </nav>
  )
}
