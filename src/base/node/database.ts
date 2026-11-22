import { AsyncLocalStorage } from 'node:async_hooks'
import type { SQLInputValue } from 'node:sqlite'
import type { DatabaseConnection } from './sqlite'

// All connection operations share one queue. A transaction owns the queue until
// commit/rollback, so concurrent crawlers, UI writes and reads cannot interleave.
export function createDatabaseClient(database: DatabaseConnection | (() => Promise<DatabaseConnection>)) {
  const operationContext = new AsyncLocalStorage<boolean>()
  const transactionContext = new AsyncLocalStorage<boolean>()
  let pending: Promise<unknown> = Promise.resolve()

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    if (operationContext.getStore()) return operation()
    const result = pending.then(() => operationContext.run(true, operation))
    pending = result.catch(() => undefined)
    return result
  }

  const useConnection = <T>(operation: (connection: DatabaseConnection) => Promise<T>) => enqueue(async () => (
    operation(typeof database === 'function' ? await database() : database)
  ))

  const run = (sql: string, ...params: SQLInputValue[]) => useConnection((connection) => connection.run(sql, ...params))

  const get = <T = any>(sql: string, ...params: SQLInputValue[]) => useConnection(
    async (connection) => await connection.get(sql, ...params) as T | undefined,
  )

  const all = <T = any>(sql: string, ...params: SQLInputValue[]) => useConnection(
    async (connection) => await connection.all(sql, ...params) as T[],
  )

  const exec = (sql: string) => useConnection((connection) => connection.exec(sql))

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

  const close = () => useConnection((connection) => connection.close())

  return {
    run,
    get,
    all,
    exec,
    transaction,
    close,
    exclusive: enqueue,
  }
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>
