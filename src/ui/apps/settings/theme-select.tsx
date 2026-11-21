import { useTranslation } from 'react-i18next'
import {
  colorThemes, defaultTheme, isTheme, neutralThemes, ThemeId,
} from '@/base/common/themes'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/ui/components/ui/select'

const groups = [
  { label: 'neutralGroup', themes: neutralThemes },
  { label: 'colorGroup', themes: colorThemes },
] as const

export default function ThemeSelect({
  value = defaultTheme,
  onChange,
}: { value?: ThemeId, onChange: (theme: ThemeId) => void }) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={(theme) => { if (isTheme(theme)) onChange(theme) }}>
      <SelectTrigger id="settings-theme" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{t(`settings.theme.${group.label}`)}</SelectLabel>
            {group.themes.map((theme) => (
              <SelectItem key={theme} value={theme}>
                <span aria-hidden className="size-3 shrink-0 rounded-full bg-primary ring-1 ring-border" data-theme={theme} />
                <span lang="en">{theme[0].toUpperCase() + theme.slice(1)}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
