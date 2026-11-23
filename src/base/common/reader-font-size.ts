export const readerFontSize = {
  default: 14,
  min: 12,
  max: 24,
  step: 1,
} as const

export function normalizeReaderFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return readerFontSize.default
  const { min, max, step } = readerFontSize
  const rounded = min + Math.round((value - min) / step) * step
  return Math.min(max, Math.max(min, rounded))
}
