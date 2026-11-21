import * as path from 'node:path'
import { verbose } from 'sqlite3'
import { createDatabaseClient } from '@/base/node/database'
import { logger } from '@/services/logger/electron-main/logger'
import * as settingService from '@/services/settings/electron-main/settings'

export const getDatabasePath = (dataPath: string) => path.join(dataPath, 'laikan.db')

const { Database } = verbose()
const database = new Database(getDatabasePath(settingService.get('dataPath')))
database.on('error', (error) => logger.error('Database error', error))
const client = createDatabaseClient(database)
export const {
  run, get, all, exec, transaction,
} = client
export default client
