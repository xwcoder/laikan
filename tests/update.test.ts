import assert from 'node:assert/strict'
import { test } from 'node:test'
import { UpdateManager } from '../src/services/updates/electron-main/update-manager'

test('automatic checks surface only newer stable versions and never install', async () => {
  let version: string | undefined
  const manager = new UpdateManager({
    currentVersion: '1.0.0',
    client: {
      check: async () => version,
      install: async () => assert.fail('A background check started an installation'),
    },
    notify: () => undefined,
    report: (error) => assert.fail(String(error)),
  })

  await manager.install()
  const unchanged = ['0.9.9', '1.0.0', '2.0.0-beta.1', 'invalid', undefined]
  await unchanged.reduce(async (previous, candidate) => {
    await previous
    version = candidate
    await manager.check()
    assert.deepEqual(manager.status, { status: 'idle' })
  }, Promise.resolve())
  version = '1.0.1'
  await manager.check()
  assert.deepEqual(manager.status, { status: 'available', version })
})

test('an explicit click waits for an in-flight check and starts exactly one installation', async () => {
  const check = Promise.withResolvers<string>()
  const download = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  let nextCheck = Promise.resolve('1.0.1')
  const installs: string[] = []
  const manager = new UpdateManager({
    currentVersion: '1.0.0',
    client: {
      check: () => nextCheck,
      install: async (version, progress) => {
        installs.push(version)
        progress(42.7)
        started.resolve()
        await download.promise
      },
    },
    notify: () => undefined,
    report: (error) => assert.fail(String(error)),
  })

  await manager.check()
  nextCheck = check.promise
  const pendingCheck = manager.check()
  assert.equal(manager.check(), pendingCheck)
  const installation = manager.install()
  await manager.install()
  assert.deepEqual(installs, [])

  check.resolve('1.0.2')
  await started.promise
  assert.deepEqual(installs, ['1.0.2'])
  assert.deepEqual(manager.status, { status: 'updating', version: '1.0.2', progress: 42 })
  download.resolve()
  await installation
})

test('a failed installation can retry and a withdrawn update clears the button', async () => {
  let version: string | undefined = '1.0.1'
  let attempts = 0
  const failures: unknown[] = []
  const error = new Error('Download interrupted')
  const manager = new UpdateManager({
    currentVersion: '1.0.0',
    client: {
      check: async () => version,
      install: async () => {
        attempts += 1
        throw error
      },
    },
    notify: () => undefined,
    report: (failure) => { failures.push(failure) },
  })

  await manager.check()
  await manager.install()
  assert.deepEqual(manager.status, { status: 'failed', version })
  assert.deepEqual(failures, [error])
  version = undefined
  await manager.install()
  assert.equal(attempts, 1)
  assert.deepEqual(manager.status, { status: 'idle' })
})
