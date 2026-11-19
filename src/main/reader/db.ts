import database from '@/services/db/electron-main/db'
import { initReaderSchema } from '@/services/reader/electron-main/schema'

export const init = () => initReaderSchema(database)
