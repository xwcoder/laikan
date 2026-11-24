import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, LoaderCircle, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { on } from '@/services/remote/browser/remote'
import { getUpdateState, installUpdate } from '@/services/updates/browser/updates'
import { Button } from '@/ui/components/ui/button'

const updateKey = ['app-update']
const minimumVisibleProgress = 5
const updateVisuals = {
  available: { Icon: ArrowDownToLine, label: 'update.install' },
  updating: { Icon: LoaderCircle, label: 'update.installing' },
  failed: { Icon: RotateCw, label: 'update.retry' },
} as const

export default function UpdateButton() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { data } = useQuery({ queryKey: updateKey, queryFn: getUpdateState, networkMode: 'always' })
  const install = useMutation({
    mutationFn: installUpdate,
    networkMode: 'always',
    meta: { inlineError: true },
  })

  useEffect(() => on('/update/change', () => {
    client.invalidateQueries({ queryKey: updateKey })
  }), [client])

  if (!data || data.status === 'idle') return null

  const status = install.isPending ? 'updating' : data.status
  const busy = status === 'updating'
  const progress = data.status === 'updating' ? data.progress : undefined
  const { Icon, label } = updateVisuals[status === 'available' && install.isError ? 'failed' : status]

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-theme-emphasis hover:text-theme-emphasis disabled:opacity-100"
      aria-label={t(label, { version: data.version })}
      aria-busy={busy}
      data-update-trigger
      disabled={busy}
      onClick={() => install.mutate()}
    >
      {progress !== undefined && progress >= minimumVisibleProgress ? (
        <span
          aria-hidden
          className="size-4 rounded-full bg-theme-emphasis/25 [mask-image:radial-gradient(transparent_50%,black_53%)]"
          style={{ backgroundImage: `conic-gradient(currentColor ${progress}%, transparent 0)` }}
        />
      ) : (
        <Icon aria-hidden className={busy ? 'motion-safe:animate-spin' : undefined} />
      )}
    </Button>
  )
}
