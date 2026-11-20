import {
  FocusEvent, useCallback, useLayoutEffect, useRef,
} from 'react'
import { ReaderModel } from '@/ui/hooks/use-reader-model'
import { useReaderStore } from '@/ui/store/reader'

const rowSelector = '[data-list-item-id]'
type Anchor = { id: number, offset: number }
type ListPosition = { page: number, scrollTop: number, anchors: Anchor[], focusedId: number | null }

function getRow(viewport: HTMLDivElement, id: number) {
  return viewport.querySelector<HTMLElement>(`[data-list-item-id="${id}"]`)
}

function getRowId(viewport: HTMLDivElement, element: Element | null) {
  const row = element?.closest<HTMLElement>(rowSelector)
  return row && viewport.contains(row) ? Number(row.dataset.listItemId) : null
}

function readPosition(viewport: HTMLDivElement, page: number): ListPosition {
  const bounds = viewport.getBoundingClientRect()
  const anchors = Array.from(viewport.querySelectorAll<HTMLElement>(rowSelector)).flatMap((row) => {
    const { top, bottom } = row.getBoundingClientRect()
    return bottom > bounds.top && top < bounds.bottom
      ? [{ id: Number(row.dataset.listItemId), offset: top - bounds.top }]
      : []
  })
  return {
    page, anchors, scrollTop: viewport.scrollTop, focusedId: getRowId(viewport, document.activeElement),
  }
}

function restorePosition(viewport: HTMLDivElement, position: ListPosition | null) {
  // Prefer the first visible article still on this page after a read or feed update.
  const anchor = position?.anchors.find(({ id }) => getRow(viewport, id))
  const row = anchor && getRow(viewport, anchor.id)
  if (row && anchor) {
    const offset = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top
    viewport.scrollTo({ top: viewport.scrollTop + offset - anchor.offset })
  } else {
    viewport.scrollTo({ top: position?.scrollTop ?? 0 })
  }
}

function restoreFocus(viewport: HTMLDivElement, visible: Anchor[], previous: ListPosition | null, id: number) {
  if (document.activeElement !== document.body) return
  const offset = previous?.anchors.find((anchor) => anchor.id === id)?.offset ?? 0
  const target = visible.find((anchor) => anchor.id === id) ?? visible.toSorted(
    (a, b) => Math.abs(a.offset - offset) - Math.abs(b.offset - offset),
  )[0]
  if (target) {
    getRow(viewport, target.id)?.querySelector<HTMLButtonElement>('button[data-article-open]')
      ?.focus({ preventScroll: true })
  }
}

export function useListPosition(model: ReaderModel) {
  const {
    page, opened, articles, activeId, focusRequest, activate,
  } = model
  const { isError, isPending } = model.list
  const viewport = useRef<HTMLDivElement | null>(null)
  const position = useRef<ListPosition | null>(null)
  const returning = useRef(false)

  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    // Capture the final scroll position before the article view removes the list DOM.
    if (!node && viewport.current && position.current) {
      position.current = readPosition(viewport.current, position.current.page)
    }
    viewport.current = node
  }, [])

  useLayoutEffect(() => {
    if (opened) {
      returning.current = true
      return
    }
    const node = viewport.current
    if (!node) return
    const previous = position.current?.page === page ? position.current : null
    restorePosition(node, previous)
    position.current = readPosition(node, page)
    const focusFrom = returning.current ? useReaderStore.getState().activeId : previous?.focusedId
    returning.current = false
    if (focusFrom != null) restoreFocus(node, position.current.anchors, previous, focusFrom)
  }, [articles, opened, page, isError, isPending])

  useLayoutEffect(() => {
    const node = viewport.current
    if (!node || focusRequest.current === null) return
    const id = focusRequest.current
    focusRequest.current = null
    if (id !== activeId) return
    const row = getRow(node, id)
    row?.querySelector<HTMLButtonElement>('button[data-article-open]')
      ?.focus({ preventScroll: true, focusVisible: false })
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    position.current = readPosition(node, page)
  }, [activeId, articles, focusRequest, opened, page])

  const rememberPosition = () => {
    if (viewport.current) position.current = readPosition(viewport.current, page)
  }
  return {
    ref: attachViewport,
    rememberPosition,
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      const id = getRowId(event.currentTarget, event.target)
      if (id !== null) activate(id)
      rememberPosition()
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (position.current && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
        position.current.focusedId = null
      }
    },
  }
}
