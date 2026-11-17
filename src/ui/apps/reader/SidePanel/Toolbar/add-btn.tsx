import { useRef, useState } from 'react'
import { Plus, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { preflightOptions, useSubscribe } from '@/ui/query/reader'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/ui/dialog'

const isFeedUrl = (value: string) => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol)

export default function AddButton() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const subscribe = useSubscribe()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const currentTitle = useRef(title)
  currentTitle.current = title

  const changeOpen = (value: boolean) => {
    if (subscribe.isPending) return
    request.current += 1
    setOpen(value)
    setUrl('')
    setTitle('')
    setError('')
    setChecking(false)
    subscribe.reset()
  }

  const preflight = async () => {
    const value = url.trim()
    if (!value) return
    if (!isFeedUrl(value)) {
      setError(t('reader.form.invalid'))
      return
    }
    request.current += 1
    const id = request.current
    const previousTitle = currentTitle.current
    setChecking(true)
    setError('')
    try {
      const feed = await client.fetchQuery(preflightOptions(value))
      if (id !== request.current) return
      if (!feed) setError(t('reader.form.notFeed'))
      else if (currentTitle.current === previousTitle) setTitle(feed.title)
    } catch {
      if (id === request.current) setError(t('reader.form.notFeed'))
    } finally {
      if (id === request.current) setChecking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={t('reader.form.title')}>
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="space-y-2">
          <DialogTitle>{t('reader.form.title')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('reader.form.description')}
          </DialogDescription>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (subscribe.isPending || checking) return
            subscribe.mutate(
              { url: url.trim(), title: title.trim() },
              {
                onSuccess: () => {
                  request.current += 1
                  setOpen(false)
                  setUrl('')
                  setTitle('')
                },
              },
            )
          }}
        >
          <div className="space-y-2">
            <label htmlFor="feed-url" className="text-sm font-medium">
              {t('reader.form.url.label')}
            </label>
            <Input
              id="feed-url"
              name="url"
              type="url"
              required
              value={url}
              disabled={subscribe.isPending}
              onChange={(event) => {
                request.current += 1
                setChecking(false)
                setError('')
                setUrl(event.target.value)
              }}
              onBlur={preflight}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="feed-title" className="text-sm font-medium">
              {t('reader.form.name.label')}
            </label>
            <Input
              id="feed-title"
              name="title"
              required
              value={title}
              disabled={subscribe.isPending}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          {checking && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              {t('reader.form.checking')}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={subscribe.isPending} onClick={() => changeOpen(false)}>
              {t('common.close')}
            </Button>
            <Button type="submit" disabled={!url.trim() || !title.trim() || checking || subscribe.isPending}>
              {subscribe.isPending && <LoaderCircle className="animate-spin" />}
              {t('reader.form.buttons.subscribe')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
