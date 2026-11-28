// Minutes between automatic refreshes. Zero disables them.
export const refreshIntervalOptions = [0, 30, 60, 120, 240, 360, 720, 1440] as const

export type RefreshInterval = typeof refreshIntervalOptions[number]

export const defaultRefreshInterval: RefreshInterval = 60

export const isRefreshInterval = (value: unknown): value is RefreshInterval => (
  refreshIntervalOptions.includes(value as RefreshInterval)
)

export const normalizeRefreshInterval = (value: unknown): RefreshInterval => (
  isRefreshInterval(value) ? value : defaultRefreshInterval
)
