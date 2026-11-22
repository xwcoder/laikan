import type { SQLInputValue, SQLOutputValue } from 'node:sqlite'
import { Worker } from 'node:worker_threads'

export type SqliteRequest =
  | { operation: 'open'; filename: string; create: boolean }
  | { operation: 'run' | 'get' | 'all'; sql: string; params: SQLInputValue[] }
  | { operation: 'exec'; sql: string }
  | { operation: 'close' }

export type SqliteReply = { value: unknown } | { error: Error }
type Row = Record<string, SQLOutputValue>
type RunResult = { lastID: number; changes: number }

export async function openDatabase(workerPath: string | URL, filename: string, create = true) {
  const worker = new Worker(workerPath)
  const pending: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = []
  let failure: Error | undefined

  const fail = (error: Error) => {
    failure ??= error
    for (const request of pending.splice(0)) request.reject(failure)
  }

  // The worker executes SQL synchronously and replies in message order.
  worker.on('message', (reply: SqliteReply) => {
    const request = pending.shift()
    if ('error' in reply) request?.reject(reply.error)
    else request?.resolve(reply.value)
  })
  worker.on('error', fail)
  worker.on('exit', (code) => fail(new Error(`SQLite worker exited (${code})`)))

  const request = <T>(command: SqliteRequest) => new Promise<T>((resolve, reject) => {
    if (failure) {
      reject(failure)
      return
    }
    worker.postMessage(command)
    pending.push({ resolve: (value) => resolve(value as T), reject })
  })

  try {
    await request({ operation: 'open', filename, create })
  } catch (error) {
    await worker.terminate()
    throw error
  }

  return {
    run: (sql: string, ...params: SQLInputValue[]) => request<RunResult>({ operation: 'run', sql, params }),
    get: (sql: string, ...params: SQLInputValue[]) => request<Row | undefined>({ operation: 'get', sql, params }),
    all: (sql: string, ...params: SQLInputValue[]) => request<Row[]>({ operation: 'all', sql, params }),
    exec: (sql: string) => request<void>({ operation: 'exec', sql }),
    close: async () => {
      try {
        await request({ operation: 'close' })
      } finally {
        await worker.terminate()
      }
    },
  }
}

export type DatabaseConnection = Awaited<ReturnType<typeof openDatabase>>
