import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { app, WebContentsView } from 'electron'
import type { ArticlePage } from '@/base/node/full-text'

const extractorHtml = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'">'
const extractorPage = `data:text/html;charset=utf-8,${encodeURIComponent(extractorHtml)}`

export async function extractArticle(page: ArticlePage): Promise<string> {
  await app.whenReady()
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/article-extractor.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      partition: 'article-extractor',
    },
  })
  const { webContents } = view
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event) => event.preventDefault())
  webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, ({ url }, respond) => {
    respond({ cancel: url !== extractorPage })
  })

  const timer = new AbortController()
  try {
    const content = webContents.loadURL(extractorPage).then(
      (): Promise<string> => webContents.executeJavaScript(`window.extractArticle(${JSON.stringify(page)})`),
    )
    const timeout = setTimeout(5000, undefined, { signal: timer.signal }).then(() => {
      throw new Error('Article extraction timed out')
    })
    return await Promise.race([content, timeout])
  } finally {
    timer.abort()
    // Keep the unattached view alive until the extraction finishes.
    if (!webContents.isDestroyed()) view.webContents.close()
  }
}
