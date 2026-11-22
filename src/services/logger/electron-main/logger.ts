import { app } from 'electron'
import { join } from 'node:path'
import { format } from 'node:util'
import { createFileLog } from '@/base/node/file-log'

const appendLog = createFileLog(join(app.getPath('userData'), 'logs'))

function timestamp() {
  const now = new Date()
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 19).replace('T', ' ')
}

type Level = 'info' | 'warn' | 'error'

const log = (level: Level) => (message: string, ...args: unknown[]) => {
  const line = `${level.toUpperCase()}: ${timestamp()}: ${format(message, ...args)}`
  // eslint-disable-next-line no-console -- The logger writes to the console as well as the log file.
  console[level](line)
  appendLog(`${line}\n`).catch((error) => {
    // eslint-disable-next-line no-console -- A file write failure must stay out of the file queue.
    console.error('Unable to write the application log', error)
  })
}

export const logger = {
  info: log('info'),
  warn: log('warn'),
  error: log('error'),
}
