import { app, WebContentsView } from 'electron'
import type { DecodeFeedIcon } from '@/base/node/feed/icon'

const decoderHtml = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">'
const decoderPage = `data:text/html;charset=utf-8,${encodeURIComponent(decoderHtml)}`

async function createDecoder() {
  await app.whenReady()
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      partition: 'feed-icon-decoder',
    },
  })
  try {
    await view.webContents.loadURL(decoderPage)
    return view
  } catch (error) {
    view.webContents?.close()
    throw error
  }
}

export function createFeedIconDecoder() {
  let view: Promise<WebContentsView> | undefined
  const decode: DecodeFeedIcon = async (bytes, mimeType) => {
    view ??= createDecoder().catch((error) => {
      view = undefined
      throw error
    })
    const pending = view
    const { webContents } = await pending
    if (!webContents || webContents.isDestroyed()) {
      if (view === pending) view = undefined
      return undefined
    }
    const type = /^image\/[a-z0-9.+-]+$/.test(mimeType) ? mimeType : 'application/octet-stream'
    const input = `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
    const rasterize = webContents.executeJavaScript(`(async (source) => {
      const image = new Image()
      // The load event also fires in an unattached WebContentsView.
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('Unable to load feed icon'))
        image.src = source
      })
      const ratio = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png').split(',')[1]
    })(${JSON.stringify(input)})`)

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        resolve(undefined)
        if (view === pending) view = undefined
        if (!webContents.isDestroyed()) webContents.close()
      }, 5_000)
    })
    try {
      const png: string | undefined = await Promise.race([rasterize, timeout])
      return png ? Buffer.from(png, 'base64') : undefined
    } finally {
      clearTimeout(timer)
    }
  }
  const close = async () => {
    const pending = view
    view = undefined
    const webContents = (await pending?.catch(() => undefined))?.webContents
    if (webContents && !webContents.isDestroyed()) webContents.close()
  }
  return { decode, close }
}
