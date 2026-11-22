import { create } from 'zustand'
import { Tab } from '@/types/reader'

type ReaderState = {
  tab: Tab | number
  page: number
  size: number
  activeId: number | null
  opened: boolean
  selectedIds: number[]
  libraryRevision: number
  unreadVersion: number
  retainedUnreadIds: ReadonlySet<number>
  retainUnread: (ids: number[]) => void
  resetUnreadView: () => void
  changeLibrary: (revision: number) => void
  changeTab: (tab: Tab | number) => void
  changePage: (page: number, activeId?: number | null) => void
  activate: (id: number | null) => void
  open: (id: number) => void
  fold: () => void
  toggleSelected: (id: number) => void
  select: (ids: number[]) => void
}

const clearUnreadView = ({ unreadVersion }: ReaderState) => ({
  unreadVersion: unreadVersion + 1,
  retainedUnreadIds: new Set<number>(),
})

const initialView = {
  page: 1,
  activeId: null,
  opened: false,
  selectedIds: [] as number[],
}

// Only client UI state lives here. IPC data belongs to the Query cache.
export const useReaderStore = create<ReaderState>((set) => ({
  tab: 'unread',
  ...initialView,
  size: 50,
  libraryRevision: 0,
  unreadVersion: 0,
  retainedUnreadIds: new Set<number>(),
  retainUnread: (ids) => set((state) => (
    state.tab === 'unread' && ids.some((id) => !state.retainedUnreadIds.has(id))
      ? { retainedUnreadIds: new Set([...state.retainedUnreadIds, ...ids]) }
      : state
  )),
  resetUnreadView: () => set(clearUnreadView),
  changeLibrary: (revision) => set((state) => ({
    ...initialView,
    ...clearUnreadView(state),
    tab: 'unread',
    libraryRevision: revision,
  })),
  changeTab: (tab) => set((state) => ({
    ...initialView,
    ...(state.tab === 'unread' || tab === 'unread' ? clearUnreadView(state) : {}),
    tab,
  })),
  changePage: (page, activeId = null) => set({ page, activeId, selectedIds: [] }),
  activate: (activeId) => set((state) => (state.activeId === activeId ? state : { activeId })),
  open: (activeId) => set({ activeId, opened: true }),
  fold: () => set({ opened: false }),
  toggleSelected: (id) => set(({ selectedIds }) => ({
    selectedIds: selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id],
  })),
  select: (selectedIds) => set({ selectedIds }),
}))
