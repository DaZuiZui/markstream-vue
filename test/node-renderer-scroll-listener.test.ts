/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useScrollListener } from '../src/components/NodeRenderer/composables/useScrollListener'

// P5 coalesces scroll observations (scrollTop read + focus sync) into one rAF
// per frame, so unit tests must flush the pending frame after dispatching
// scroll events.
let frameCallbacks: FrameRequestCallback[] = []

function flushFrames() {
  const pending = frameCallbacks.splice(0)
  for (const callback of pending)
    callback(performance.now())
}

beforeEach(() => {
  frameCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback)
    return frameCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

function createRoot() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

function createHarness(options: {
  isClient?: boolean
  virtualized?: boolean
  listenerEnabled?: boolean
  root?: HTMLElement | null
  onScroll?: () => void
  getScrollTop?: (root: HTMLElement) => number
} = {}) {
  const root = ref<HTMLElement | null>(
    options.root === undefined ? createRoot() : options.root,
  )
  const virtualized = ref(options.virtualized ?? true)
  const listenerEnabled = options.listenerEnabled == null
    ? null
    : ref(options.listenerEnabled)
  const scrollRootElement = ref<HTMLElement | null>(null)
  const resolveScrollContainer = vi.fn(() => root.value)
  const scheduleFocusSync = vi.fn()

  const listener = useScrollListener({
    isClient: options.isClient ?? true,
    virtualizationEnabled: computed(() => virtualized.value),
    listenerEnabled: listenerEnabled
      ? computed(() => listenerEnabled.value)
      : undefined,
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
    onScroll: options.onScroll,
    getScrollTop: options.getScrollTop,
  })

  return {
    root,
    virtualized,
    listenerEnabled,
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
    listener,
  }
}

describe('useScrollListener', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does nothing when not running on the client', () => {
    const h = createHarness({
      isClient: false,
    })

    h.listener.setupScrollListener()

    expect(h.resolveScrollContainer).not.toHaveBeenCalled()
    expect(h.scrollRootElement.value).toBeNull()
  })

  it('does nothing when virtualization is disabled', () => {
    const h = createHarness({
      virtualized: false,
    })

    h.listener.setupScrollListener()

    expect(h.resolveScrollContainer).not.toHaveBeenCalled()
    expect(h.scrollRootElement.value).toBeNull()
  })

  it('observes scrolling when requestAnimationFrame is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const h = createHarness()

    h.listener.setupScrollListener()

    expect(() => h.root.value!.dispatchEvent(new Event('scroll'))).not.toThrow()
    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('can attach a virtual-scroll-only listener without scheduling focus sync', () => {
    const onScroll = vi.fn()
    const h = createHarness({
      virtualized: false,
      listenerEnabled: true,
      onScroll,
    })

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('does nothing when no scroll root is resolved', () => {
    const h = createHarness({
      root: null,
    })

    h.listener.setupScrollListener()

    expect(h.resolveScrollContainer).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBeNull()
  })

  it('detaches the old listener when the scroll root disappears', () => {
    const oldRoot = createRoot()
    const h = createHarness({
      root: oldRoot,
    })
    const removeEventListener = vi.spyOn(oldRoot, 'removeEventListener')

    h.listener.setupScrollListener()
    expect(h.scrollRootElement.value).toBe(oldRoot)

    h.root.value = null
    h.listener.setupScrollListener()

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBeNull()

    oldRoot.dispatchEvent(new Event('scroll'))
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('detaches the old listener when listenerEnabled becomes false', () => {
    const root = createRoot()
    const h = createHarness({
      root,
      listenerEnabled: true,
    })
    const removeEventListener = vi.spyOn(root, 'removeEventListener')

    h.listener.setupScrollListener()
    expect(h.scrollRootElement.value).toBe(root)

    h.listenerEnabled!.value = false
    h.listener.setupScrollListener()

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBeNull()

    root.dispatchEvent(new Event('scroll'))
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('attaches a passive scroll listener and stores the scroll root', () => {
    const h = createHarness()
    const addEventListener = vi.spyOn(h.root.value!, 'addEventListener')

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)
    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { passive: true },
    )

    h.root.value!.dispatchEvent(new Event('scroll'))
    flushFrames()

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
    expect(h.scheduleFocusSync).toHaveBeenCalledWith()
  })

  it('schedules immediate focus sync for the first large scroll jump', () => {
    const root = createRoot()
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      value: 600,
    })

    root.scrollTop = 0

    const h = createHarness({ root })

    h.listener.setupScrollListener()

    root.scrollTop = 3000
    root.dispatchEvent(new Event('scroll'))
    flushFrames()

    expect(h.scheduleFocusSync).toHaveBeenCalledWith({ immediate: true })
  })

  it('uses normalized scrollTop values for large jump detection', () => {
    const root = createRoot()
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    })

    const getScrollTop = vi.fn(() => {
      return root.scrollTop === 0 ? 3000 : 1000
    })
    const h = createHarness({ root, getScrollTop })

    h.listener.setupScrollListener()

    root.scrollTop = -120
    root.dispatchEvent(new Event('scroll'))
    flushFrames()

    expect(getScrollTop).toHaveBeenCalledWith(root)
    expect(h.scheduleFocusSync).toHaveBeenCalledWith({ immediate: true })
  })

  it('runs the external scroll hook before scheduling focus sync', () => {
    const calls: string[] = []
    const h = createHarness({
      onScroll: () => calls.push('hook'),
    })
    h.scheduleFocusSync.mockImplementation(() => {
      calls.push('focus')
    })

    h.listener.setupScrollListener()
    h.root.value!.dispatchEvent(new Event('scroll'))

    // The external hook runs synchronously per scroll event; the focus sync is
    // coalesced into the next frame.
    expect(calls).toEqual(['hook'])
    flushFrames()

    expect(calls).toEqual(['hook', 'focus'])
  })

  it('does not attach a duplicate listener for the same root', () => {
    const h = createHarness()
    const addEventListener = vi.spyOn(h.root.value!, 'addEventListener')

    h.listener.setupScrollListener()
    h.listener.setupScrollListener()
    h.listener.setupScrollListener()

    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))
    flushFrames()

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('detaches the old root and attaches the new root when root changes', () => {
    const oldRoot = createRoot()
    const newRoot = createRoot()
    const h = createHarness({
      root: oldRoot,
    })

    const oldRemoveEventListener = vi.spyOn(oldRoot, 'removeEventListener')
    const newAddEventListener = vi.spyOn(newRoot, 'addEventListener')

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(oldRoot)

    h.root.value = newRoot
    h.listener.setupScrollListener()

    expect(oldRemoveEventListener).toHaveBeenCalledTimes(1)
    expect(newAddEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBe(newRoot)

    h.scheduleFocusSync.mockClear()

    oldRoot.dispatchEvent(new Event('scroll'))
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()

    newRoot.dispatchEvent(new Event('scroll'))
    flushFrames()
    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('cleanup removes the listener and clears the stored scroll root', () => {
    const h = createHarness()
    const removeEventListener = vi.spyOn(h.root.value!, 'removeEventListener')

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.listener.cleanupScrollListener()

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBeNull()

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('cleanup is safe when no listener is attached', () => {
    const h = createHarness()

    h.listener.cleanupScrollListener()
    h.listener.cleanupScrollListener()

    expect(h.scrollRootElement.value).toBeNull()
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('can attach again after cleanup', () => {
    const h = createHarness()

    h.listener.setupScrollListener()
    h.listener.cleanupScrollListener()
    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))
    flushFrames()

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('rechecks virtualization on later setup calls', () => {
    const h = createHarness({
      virtualized: false,
    })

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBeNull()

    h.virtualized.value = true
    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))
    flushFrames()

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })
})
