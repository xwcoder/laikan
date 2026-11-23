import assert from 'node:assert/strict'
import {
  mkdtemp, readdir, readFile, rm, writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFileLog } from '../src/base/node/file-log'

test('queued writes rotate by bytes and resume the newest log after restarting', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'yikan-log-'))
  context.after(() => rm(directory, { force: true, recursive: true }))
  await Promise.all([
    writeFile(join(directory, 'yikan.log'), 'older\n'),
    writeFile(join(directory, 'yikan9.log'), 'old\n'),
    writeFile(join(directory, 'other.log'), 'unrelated\n'),
  ])

  const append = createFileLog(directory, 8, 2)
  await Promise.all([append('中文\n'), append('A\n')])
  await createFileLog(directory, 8, 2)('B\n')

  assert.deepEqual((await readdir(directory)).sort(), ['other.log', 'yikan10.log', 'yikan11.log'])
  assert.equal(await readFile(join(directory, 'yikan10.log'), 'utf8'), '中文\n')
  assert.equal(await readFile(join(directory, 'yikan11.log'), 'utf8'), 'A\nB\n')
})
