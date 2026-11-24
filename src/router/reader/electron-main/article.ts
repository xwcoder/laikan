import * as articleService from '@/services/reader/electron-main/article'
import { ReaderLibraryChangedError } from '@/services/db/electron-main/db'
import { logger } from '@/services/logger/electron-main/logger'
import { router } from './router'

router.get('/article', (_, id: number) => articleService.getById(id))

router.post('/article/full-text', async (_, id: number) => {
  try {
    return await articleService.loadFullText(id)
  } catch (error) {
    if (!(error instanceof ReaderLibraryChangedError)) logger.warn('[Reader] Full text extraction failed', error)
    return null
  }
})

router.get('/articles', async (_, params) => {
  const { count, rows } = await articleService.find(params)
  return {
    data: rows,
    count,
  }
})

router.get('/articles/unread-count', () => articleService.countUnread())

router.put('/article/starred', (_, { id, status }) => articleService.starred(id, status))

router.put('/article/read', (_, { ids, status }) => articleService.markRead(ids, status))

router.put('/feed/read', (_, id: number) => articleService.markFeedRead(id))
