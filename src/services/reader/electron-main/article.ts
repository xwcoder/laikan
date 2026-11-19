import database from '@/services/db/electron-main/db'
import { createArticleRepository } from './article-repository'

export const {
  getById, upsert, find, starred, markRead,
} = createArticleRepository(database)
