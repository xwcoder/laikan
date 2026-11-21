import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'

export const readJSON = (path: string) => {
  try {
    const content = fs.readFileSync(path, { encoding: 'utf8' })
    return JSON.parse(content)
  } catch {
    // TODO
    return null
  }
}

export const writeJSON = (path: string, data: unknown) => {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2))
  } catch {
    // Window state is best effort.
  }
}

export const writeJSONAtomically = (path: string, data: unknown) => {
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' })
    fs.renameSync(temporaryPath, path)
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      // Keep the original save error.
    }
    throw error
  }
}
