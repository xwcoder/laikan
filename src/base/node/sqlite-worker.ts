import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { parentPort } from 'node:worker_threads'
import type { SqliteReply, SqliteRequest } from './sqlite'

if (!parentPort) throw new Error('SQLite must run in a worker')
const port = parentPort
let database: DatabaseSync

function existingFileUri(filename: string) {
  const url = pathToFileURL(filename)
  // SQLite accepts Windows UNC paths in the path component of a file URI.
  const uri = url.host ? `file:////${url.host}${url.pathname}` : url.href
  return `${uri}?mode=rw`
}

function execute(request: SqliteRequest) {
  switch (request.operation) {
    case 'open':
      database = new DatabaseSync(request.create ? request.filename : existingFileUri(request.filename), {
        // The schema migration enables foreign keys after handling legacy rows.
        enableForeignKeyConstraints: false,
        timeout: 1000,
      })
      return undefined
    case 'exec':
      return database.exec(request.sql)
    case 'close':
      return database.close()
    case 'get':
      return database.prepare(request.sql).get(...request.params)
    case 'all':
      return database.prepare(request.sql).all(...request.params)
    case 'run': {
      const { lastInsertRowid, changes } = database.prepare(request.sql).run(...request.params)
      return { lastID: Number(lastInsertRowid), changes: Number(changes) }
    }
    default:
      throw new Error('Unknown SQLite operation')
  }
}

port.on('message', (request: SqliteRequest) => {
  let reply: SqliteReply
  try {
    reply = { value: execute(request) }
  } catch (error) {
    reply = { error: error instanceof Error ? error : new Error(String(error)) }
  }
  port.postMessage(reply)
})
