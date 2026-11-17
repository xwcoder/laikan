import { create } from 'zustand'
import { Apps } from '@/types/common'

type AppState = {
  app: Apps
  error: string | null
  changeApp: (app: Apps) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  app: 'reader',
  error: null,
  changeApp: (app) => set({ app }),
  setError: (error) => set({ error }),
}))
