import { AsyncLocalStorage } from 'node:async_hooks'
import type { Database } from 'sqlite3'

export type RunResult = { lastID: number; changes: number }

// All connection operations share one queue. A transaction owns the queue until
// commit/rollback, so concurrent crawlers, UI writes and reads cannot interleave.
export function createDatabaseClient(database: Database) {
  const operationContext = new AsyncLocalStorage<boolean>()
  const transactionContext = new AsyncLocalStorage<boolean>()
  let pending: Promise<unknown> = Promise.resolve()

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    if (operationContext.getStore()) return operation()
    const result = pending.then(() => operationContext.run(true, operation))
    pending = result.catch(() => undefined)
    return result
  }

  const run = (sql: string, ...params: unknown[]) => enqueue(
    () => new Promise<RunResult>((resolve, reject) => {
      database.run(sql, ...params, function complete(this: RunResult, error: Error | null) {
        if (error) reject(error)
        else resolve({ lastID: this.lastID, changes: this.changes })
      })
    }),
  )

  const get = <T = any>(sql: string, ...params: unknown[]) => enqueue(
    () => new Promise<T | undefined>((resolve, reject) => {
      database.get(sql, ...params, (error: Error | null, row: T | undefined) => {
        if (error) reject(error)
        else resolve(row)
      })
    }),
  )

  const all = <T = any>(sql: string, ...params: unknown[]) => enqueue(
    () => new Promise<T[]>((resolve, reject) => {
      database.all(sql, ...params, (error: Error | null, rows: T[]) => {
        if (error) reject(error)
        else resolve(rows)
      })
    }),
  )

  const exec = (sql: string) => enqueue(
    () => new Promise<void>((resolve, reject) => {
      database.exec(sql, (error) => {
        if (error) reject(error)
        else resolve()
      })
    }),
  )

  const transaction = <T>(operation: () => Promise<T>): Promise<T> => {
    if (transactionContext.getStore()) return operation()
    return enqueue(() => transactionContext.run(true, async () => {
      await run('BEGIN IMMEDIATE')
      try {
        const value = await operation()
        await run('COMMIT')
        return value
      } catch (error) {
        await run('ROLLBACK').catch(() => undefined)
        throw error
      }
    }))
  }

  const close = () => enqueue(
    () => new Promise<void>((resolve, reject) => {
      database.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    }),
  )

  return {
    run,
    get,
    all,
    exec,
    transaction,
    close,
  }
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>
