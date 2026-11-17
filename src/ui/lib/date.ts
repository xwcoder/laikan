export function formatDate(value: string | undefined, locale: string, includeTime = false) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(date)
}
