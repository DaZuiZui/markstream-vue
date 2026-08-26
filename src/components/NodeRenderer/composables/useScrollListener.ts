import type { ComputedRef, Ref } from 'vue'

export interface ScrollListenerOptions {
  isClient: boolean
  virtualizationEnabled: ComputedRef<boolean>
  listenerEnabled?: ComputedRef<boolean>
  scrollRootElement: Ref<HTMLElement | null>
  resolveScrollContainer: (node?: HTMLElement | null) => HTMLElement | null
  scheduleFocusSync: (options?: { immediate?: boolean }) => void
  onScroll?: () => void
  getScrollTop?: (root: HTMLElement) => number
}

export interface ScrollListener {
  cleanupScrollListener: () => void
  setupScrollListener: () => void
}

export function useScrollListener(
  options: ScrollListenerOptions,
): ScrollListener {
  const {
    isClient,
    virtualizationEnabled,
    listenerEnabled,
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
    onScroll,
  } = options

  let detachScrollHandler: (() => void) | null = null
  let lastObservedScrollTop: number | null = null
  let scrollObservationPending = false
  let scrollObservationRafId: number | null = null

  function cleanupScrollListener() {
    if (scrollObservationRafId != null) {
      if (typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(scrollObservationRafId)
      scrollObservationRafId = null
    }
    scrollObservationPending = false

    if (detachScrollHandler) {
      detachScrollHandler()
      detachScrollHandler = null
    }

    lastObservedScrollTop = null
    scrollRootElement.value = null
  }

  function isListenerEnabled() {
    return listenerEnabled?.value ?? virtualizationEnabled.value
  }

  function setupScrollListener() {
    if (!isClient)
      return

    if (!isListenerEnabled()) {
      cleanupScrollListener()
      return
    }

    const root = resolveScrollContainer()

    if (!root) {
      cleanupScrollListener()
      return
    }

    if (scrollRootElement.value === root && detachScrollHandler)
      return

    cleanupScrollListener()

    lastObservedScrollTop = readObservedScrollTop(root)

    // Scroll events fire at input frequency (120Hz+) while the browser only
    // paints at 60fps, so reading scrollTop (a synchronous layout read) and
    // running the focus sync on every event is pure waste. Deduplicate into a
    // single observation per frame; the jump detection below compares the
    // previous frame's scrollTop, so semantics are unchanged.
    const scheduleScrollObservation = () => {
      if (scrollObservationPending)
        return
      scrollObservationPending = true
      scrollObservationRafId = requestAnimationFrame(() => {
        scrollObservationPending = false
        scrollObservationRafId = null
        if (virtualizationEnabled.value) {
          const options = resolveFocusSyncScheduleOptions(root)
          if (options)
            scheduleFocusSync(options)
          else
            scheduleFocusSync()
        }
      })
    }

    const handler = () => {
      // Anchor release must stay synchronous: bottom-anchor restore logic can
      // run between the scroll event and the next frame, and releasing the
      // anchor first is what keeps the scroll position user-controlled.
      onScroll?.()
      if (virtualizationEnabled.value)
        scheduleScrollObservation()
    }

    root.addEventListener('scroll', handler, { passive: true })
    scrollRootElement.value = root

    detachScrollHandler = () => {
      root.removeEventListener('scroll', handler)
    }
  }

  function resolveFocusSyncScheduleOptions(root: HTMLElement) {
    const current = readObservedScrollTop(root)
    const previous = lastObservedScrollTop
    lastObservedScrollTop = current

    const immediateThreshold = Math.max(480, (root.clientHeight || 0) * 0.75)

    if (previous == null) {
      return current > immediateThreshold
        ? { immediate: true }
        : undefined
    }

    const jump = Math.abs(current - previous)

    return jump > immediateThreshold
      ? { immediate: true }
      : undefined
  }

  function readObservedScrollTop(root: HTMLElement) {
    const raw = options.getScrollTop
      ? options.getScrollTop(root)
      : root.scrollTop

    return Math.max(0, Number.isFinite(raw) ? Math.abs(raw) : 0)
  }

  return {
    cleanupScrollListener,
    setupScrollListener,
  }
}
