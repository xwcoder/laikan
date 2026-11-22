import {
  appendFile, mkdir, readdir, rm, stat,
} from 'node:fs/promises'
import { join } from 'node:path'

const logName = /^laikan([1-9]\d*)?\.log$/

async function logIndices(directory: string) {
  await mkdir(directory, { recursive: true })
  const entries = await readdir(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const match = entry.isFile() && logName.exec(entry.name)
    const index = match ? Number(match[1] ?? 0) : NaN
    return Number.isSafeInteger(index) ? [index] : []
  }).sort((a, b) => a - b)
}

async function logSize(filename: string) {
  try {
    return (await stat(filename)).size
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return 0
    throw error
  }
}

export function createFileLog(directory: string, maxBytes = 30 * 1024 * 1024, maxFiles = 30) {
  const filename = (index: number) => join(directory, index === 0 ? 'laikan.log' : `laikan${index}.log`)
  let files: number[] | undefined
  let pending = Promise.resolve()

  const append = async (line: string) => {
    files ??= await logIndices(directory)
    const current = files.at(-1) ?? 0
    const size = await logSize(filename(current))
    const index = size > 0 && size + Buffer.byteLength(line) > maxBytes ? current + 1 : current
    await appendFile(filename(index), line)
    if (files.at(-1) !== index) files.push(index)

    const excess = files.length - maxFiles
    if (excess > 0) {
      await Promise.all(files.slice(0, excess).map((old) => rm(filename(old), { force: true })))
      files.splice(0, excess)
    }
  }

  return (line: string) => {
    const write = pending.then(() => append(line))
    pending = write.catch(() => {
      // Rescan after a partial rotation or a missing log directory.
      files = undefined
    })
    return write
  }
}
