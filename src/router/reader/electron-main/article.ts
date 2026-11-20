import * as articleService from '@/services/reader/electron-main/article'
import { logger } from '@/services/logger/electron-main/logger'
import { router } from './router'

router.get('/article', (_, id: number) => articleService.getById(id))

router.post('/article/full-text', async (_, id: number) => {
  try {
    return await articleService.loadFullText(id)
  } catch (error) {
    logger.warn('[Reader] Full text extraction failed', error)
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

router.put('/article/starred', (_, { id, status }) => articleService.starred(id, status))

router.put('/article/read', (_, { ids, status }) => articleService.markRead(ids, status))
