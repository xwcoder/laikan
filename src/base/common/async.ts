export async function runConcurrent<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Concurrency must be a positive integer')
  let index = 0
  const errors: unknown[] = []
  const worker = async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      try {
        // eslint-disable-next-line no-await-in-loop -- Preserve backpressure and ordered processing.
        await task(item)
      } catch (error) {
        errors.push(error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (errors.length) throw new AggregateError(errors, 'Some tasks failed')
}
