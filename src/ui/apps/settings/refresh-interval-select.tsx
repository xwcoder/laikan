import { useTranslation } from 'react-i18next'
import {
  defaultRefreshInterval, isRefreshInterval, RefreshInterval, refreshIntervalOptions,
} from '@/base/common/refresh-interval'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ui/components/ui/select'

function useIntervalLabel() {
  const { t } = useTranslation()
  return (minutes: RefreshInterval) => {
    if (!minutes) return t('settings.refreshInterval.manual')
    if (minutes < 60) return t('settings.refreshInterval.minutes', { count: minutes })
    return t('settings.refreshInterval.hours', { count: minutes / 60 })
  }
}

export default function RefreshIntervalSelect({
  value = defaultRefreshInterval,
  onChange,
}: { value?: RefreshInterval, onChange: (interval: RefreshInterval) => void }) {
  const label = useIntervalLabel()

  return (
    <Select
      value={String(value)}
      onValueChange={(next) => {
        const minutes = Number(next)
        if (isRefreshInterval(minutes)) onChange(minutes)
      }}
    >
      <SelectTrigger id="settings-refresh-interval" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {refreshIntervalOptions.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>{label(minutes)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
