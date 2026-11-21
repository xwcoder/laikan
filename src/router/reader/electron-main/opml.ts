import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import { FeedError } from '@/base/common/feed-error'
import { maxXmlBytes } from '@/base/node/feed/xml'
import { writeTextAtomically } from '@/base/node/fs/promise'
import { parseOpml, serializeOpml } from '@/base/node/opml'
import { logger } from '@/services/logger/electron-main/logger'
import { refreshImportedFeeds } from '@/services/reader/electron-main/crawler'
import { getSubscriptions, importSubscriptions } from '@/services/reader/electron-main/feed'
import { Feed, FeedTransferResult } from '@/types/reader'
import { router } from './router'

async function readOpmlFile(path: string) {
  // eslint-disable-next-line no-bitwise -- Opening a FIFO must not block on a writer.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error('Expected a regular file')
    if (info.size > maxXmlBytes) throw new FeedError('limit', 'OPML file exceeds 10 MiB')
    const chunks: Buffer[] = []
    // The inclusive end lets us detect a file that grew past the limit after stat.
    for await (const chunk of file.createReadStream({ end: maxXmlBytes, autoClose: false })) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    if (bytes.length > maxXmlBytes) throw new FeedError('limit', 'OPML file exceeds 10 MiB')
    return bytes
  } finally {
    await file.close()
  }
}

function importFileError(error: unknown): FeedTransferResult {
  if (!(error instanceof FeedError)) return { error: 'readFile' }
  if (error.kind === 'encoding' || error.kind === 'limit') return { error: error.kind }
  return { error: 'invalidOpml' }
}

router.post('/feed/import', async (_, _data, { sender }): Promise<FeedTransferResult> => {
  const window = BrowserWindow.fromWebContents(sender)
  if (!window) return { status: 'canceled' }
  const { canceled, filePaths: [path] } = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'OPML / XML', extensions: ['opml', 'xml'] }],
  })
  if (canceled || !path) return { status: 'canceled' }

  let feeds: Feed[]
  try {
    feeds = await parseOpml(await readOpmlFile(path))
  } catch (error) {
    logger.error('[Reader] Unable to read OPML file', error)
    return importFileError(error)
  }
  if (!feeds.length) return { status: 'noValidFeeds' }

  const added = await importSubscriptions(feeds)
  if (!added.length) return { status: 'noNewFeeds' }
  refreshImportedFeeds(added).catch((error) => logger.error('[Reader] Unable to refresh imported feeds', error))
  return { status: 'imported' }
})

router.post('/feed/export', async (_, _data, { sender }): Promise<FeedTransferResult> => {
  const window = BrowserWindow.fromWebContents(sender)
  if (!window) return { status: 'canceled' }
  const feeds = await getSubscriptions()
  if (!feeds.length) return { status: 'noFeeds' }
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    defaultPath: 'emo-subscriptions.opml',
    filters: [{ name: 'OPML', extensions: ['opml'] }],
  })
  if (canceled || !filePath) return { status: 'canceled' }

  try {
    await writeTextAtomically(filePath, serializeOpml(feeds))
  } catch (error) {
    logger.error('[Reader] Unable to write OPML file', error)
    return { error: 'writeFile' }
  }
  return { status: 'exported' }
})
