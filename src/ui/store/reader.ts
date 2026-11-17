import { create } from 'zustand'
import { Tab } from '@/types/reader'

type ReaderState = {
  tab: Tab | number
  page: number
  size: number
  activeId: number | null
  opened: boolean
  selectedIds: number[]
  changeTab: (tab: Tab | number) => void
  changePage: (page: number) => void
  activate: (id: number | null) => void
  open: (id: number) => void
  fold: () => void
  toggleSelected: (id: number) => void
  select: (ids: number[]) => void
}

// Only client UI state lives here. IPC data belongs to the Query cache.
export const useReaderStore = create<ReaderState>((set) => ({
  tab: 'unread',
  page: 1,
  size: 50,
  activeId: null,
  opened: false,
  selectedIds: [],
  changeTab: (tab) => set({
    tab,
    page: 1,
    activeId: null,
    opened: false,
    selectedIds: [],
  }),
  changePage: (page) => set({ page, activeId: null, selectedIds: [] }),
  activate: (activeId) => set({ activeId }),
  open: (activeId) => set({ activeId, opened: true }),
  fold: () => set({ opened: false }),
  toggleSelected: (id) => set(({ selectedIds }) => ({
    selectedIds: selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id],
  })),
  select: (selectedIds) => set({ selectedIds }),
}))
