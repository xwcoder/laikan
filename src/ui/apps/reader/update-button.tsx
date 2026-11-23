import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, LoaderCircle, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { on } from '@/services/remote/browser/remote'
import { getUpdateState, installUpdate } from '@/services/updates/browser/updates'
import { Button } from '@/ui/components/ui/button'

const updateKey = ['app-update']
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

  const busy = data.status === 'updating'
  const progress = data.status === 'updating' ? data.progress : undefined
  const status = data.status === 'available' && install.isError ? 'failed' : data.status
  const { Icon, label } = updateVisuals[status]

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={t(label, { version: data.version })}
      aria-busy={busy}
      data-update-trigger
      disabled={busy || install.isPending}
      onClick={() => install.mutate()}
    >
      {progress !== undefined ? (
        <span
          aria-hidden
          className="size-4 rounded-full [mask-image:radial-gradient(transparent_50%,black_53%)]"
          style={{ background: `conic-gradient(currentColor ${progress}%, transparent 0), var(--color-muted)` }}
        />
      ) : (
        <Icon aria-hidden className={busy ? 'motion-safe:animate-spin' : undefined} />
      )}
    </Button>
  )
}
