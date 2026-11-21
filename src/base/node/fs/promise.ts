import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const readJSON = async (path: string) => {
  try {
    const content = await fs.readFile(path, { encoding: 'utf8' })
    return JSON.parse(content)
  } catch {
    // TODO
    return null
  }
}

export const writeJSON = async (path: string, data: any) => {
  try {
    return fs.writeFile(path, JSON.stringify(data, null, 2))
  } catch {
    // TODO
    return null
  }
}

export async function writeTextAtomically(path: string, text: string) {
  const temporaryPath = join(dirname(path), `.laikan-${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporaryPath, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(temporaryPath, path)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}
