import assert from 'node:assert/strict'
import {
  mkdtemp, readdir, readFile, rm, writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFileLog } from '../src/base/node/file-log'

test('queued writes rotate by bytes and resume the newest log after restarting', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'laikan-log-'))
  context.after(() => rm(directory, { force: true, recursive: true }))
  await Promise.all([
    writeFile(join(directory, 'laikan.log'), 'older\n'),
    writeFile(join(directory, 'laikan9.log'), 'old\n'),
    writeFile(join(directory, 'other.log'), 'unrelated\n'),
  ])

  const append = createFileLog(directory, 8, 2)
  await Promise.all([append('中文\n'), append('A\n')])
  await createFileLog(directory, 8, 2)('B\n')

  assert.deepEqual((await readdir(directory)).sort(), ['laikan10.log', 'laikan11.log', 'other.log'])
  assert.equal(await readFile(join(directory, 'laikan10.log'), 'utf8'), '中文\n')
  assert.equal(await readFile(join(directory, 'laikan11.log'), 'utf8'), 'A\nB\n')
})
