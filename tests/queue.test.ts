import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runConcurrent } from '../src/base/common/async'

test('an empty queue completes so the next poll can be scheduled', async () => {
  await runConcurrent([], 4, async () => assert.fail('No work expected'))
})

test('the queue waits for slow tasks, preserves its concurrency bound and processes every item', async () => {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let active = 0
  let maxActive = 0
  let finished = false
  const completed: number[] = []
  const result = runConcurrent([0, 1, 2, 3], 2, async (value) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    if (value === 0) await gate
    completed.push(value)
    active -= 1
  }).then(() => {
    finished = true
  })
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(finished, false)
  release()
  await result
  assert.equal(maxActive, 2)
  assert.deepEqual(completed.sort(), [0, 1, 2, 3])
})

test('a failing task does not abandon the remaining work', async () => {
  const visited: number[] = []
  await assert.rejects(
    runConcurrent([0, 1, 2], 1, async (value) => {
      visited.push(value)
      if (value === 0) throw new Error('Bad feed')
    }),
    AggregateError,
  )
  assert.deepEqual(visited, [0, 1, 2])
})
