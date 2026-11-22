import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { constants, Stats } from 'node:fs'
import {
  copyFile, link, open, realpath, rm, stat,
} from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import {
  Database, OPEN_CREATE, OPEN_FULLMUTEX, OPEN_READWRITE, verbose,
} from 'sqlite3'
import { createDatabaseClient } from '@/base/node/database'
import { logger } from '@/services/logger/electron-main/logger'
import { initReaderSchema } from '@/services/reader/electron-main/schema'
import * as settingService from '@/services/settings/electron-main/settings'

const databasePath = (directory: string) => join(directory, 'laikan.db')
const SQLiteDatabase = verbose().Database

async function openReaderDatabase(filename: string, create: boolean) {
  // eslint-disable-next-line no-bitwise -- SQLite open modes are bit flags.
  const mode = OPEN_READWRITE | OPEN_FULLMUTEX | (create ? OPEN_CREATE : 0)
  const connection = await new Promise<Database>((succeed, reject) => {
    const db = new SQLiteDatabase(filename, mode, (error) => {
      if (error) reject(error)
      else succeed(db)
    })
  })
  connection.on('error', (error) => logger.error('Database error', error))
  const db = createDatabaseClient(connection)
  try {
    if (!create) {
      const check = await db.get<{ quick_check: string }>('PRAGMA quick_check(1)')
      if (check?.quick_check !== 'ok') throw new Error('Database integrity check failed')
    }
    await initReaderSchema(db)
    return connection
  } catch (error) {
    await db.close().catch((failure) => logger.error('[Reader] Unable to close database', failure))
    throw error
  }
}

const libraryContext = new AsyncLocalStorage<number>()
let libraryRevision = 0

export class ReaderLibraryChangedError extends Error {
  constructor() {
    super('The reader library changed')
  }
}

export const getLibraryRevision = () => libraryContext.getStore() ?? libraryRevision
export const isCurrentLibrary = (revision = getLibraryRevision()) => revision === libraryRevision

export function withReaderLibrary<T>(operation: () => T, revision = getLibraryRevision()): T {
  return libraryContext.run(revision, operation)
}

let connection = openReaderDatabase(databasePath(settingService.get('dataPath')), true)
connection.catch((error) => logger.error('[Reader] Database initialization failed', error))

// Reads and writes check their library inside the queue, including work resumed after a network request.
const client = createDatabaseClient(() => {
  if (!isCurrentLibrary()) throw new ReaderLibraryChangedError()
  return connection
})
export const {
  run, get, all, exec, transaction,
} = client
export default client

function fileInfo(filename: string) {
  return stat(filename).catch((error: { code?: string }) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
}

async function isSameFile(target: Stats, previous: string) {
  const source = await fileInfo(previous).catch(() => undefined)
  return target.ino !== 0 && source?.ino === target.ino && source.dev === target.dev
}

const removeFile = (filename: string) => (
  rm(filename, { force: true }).catch((error) => logger.error('[Reader] Unable to remove database file', error))
)

async function copyDatabase(destination: string) {
  const snapshot = `${destination}.${randomUUID()}.tmp`
  const file = await open(snapshot, 'wx', 0o600)
  try {
    await file.close()
    // SQLite includes committed WAL pages and can write the snapshot to another volume.
    await run('VACUUM INTO ?', snapshot)
    try {
      await link(snapshot, destination)
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      // Some volumes do not support hard links. Either operation fails if the destination already exists.
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(code)) throw error
      await copyFile(snapshot, destination, constants.COPYFILE_EXCL)
    }
  } finally {
    await removeFile(snapshot)
  }
}

async function prepareDatabase(directory: string, destination: string, migrating: boolean) {
  if (migrating) await copyDatabase(destination)
  let next: Database | undefined
  try {
    next = await openReaderDatabase(destination, false)
    settingService.set('dataPath', directory)
    return next
  } catch (error) {
    if (next) {
      await createDatabaseClient(next).close()
        .catch((failure) => logger.error('[Reader] Unable to close database', failure))
    }
    if (migrating) await removeFile(destination)
    throw error
  }
}

async function switchDatabase(directory: string) {
  const previous: string = settingService.get('dataPath')
  if (directory === previous) return
  const destinationDirectory = await realpath(directory)
  if (destinationDirectory === await realpath(previous).catch(() => undefined)) return

  const destination = databasePath(directory)
  const source = databasePath(previous)
  const info = await fileInfo(destination)
  if (info) {
    if (!info.isFile()) throw new Error('Expected a regular database file')
    if (await isSameFile(info, source)) return
  }

  const migrating = !info
  const oldConnection = connection
  const next = await prepareDatabase(directory, destination, migrating)
  connection = Promise.resolve(next)
  if (!migrating) libraryRevision += 1

  try {
    await createDatabaseClient(await oldConnection).close()
    if (migrating) await removeFile(source)
  } catch (error) {
    logger.error('[Reader] Unable to close previous database', error)
  }
}

export function changeDataPath(value: unknown) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new TypeError('Select an absolute data directory')
  return client.exclusive(() => switchDatabase(resolve(value)))
}
