/**
 * @vitest-environment jsdom
 *
 * Regression/perf verification for the streaming coalescing changes:
 * - P4: parsedNodes.length / renderedCount watchers share ONE per-frame focus
 *   sync instead of three synchronous syncFocusToScroll calls per commit.
 * - P5: high-frequency scroll events read scrollTop once per frame instead of
 *   once per event.
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushAll } from './setup/flush-all'

function createParagraph(index: number) {
  return {
    type: 'paragraph',
    raw: `Paragraph ${index}`,
    children: [
      {
        type: 'text',
        content: `Paragraph ${index}`,
        raw: `Paragraph ${index}`,
      },
    ],
  } as any
}

function installFramePlatform() {
  const frames: FrameRequestCallback[] = []
  const scrollListeners = new Map<HTMLElement, EventListener>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  const scrollTopSpy = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockReturnValue(0)

  return {
    frames,
    scrollTopSpy,
    flushFrames() {
      const pending = frames.splice(0)
      for (const callback of pending)
        callback(performance.now())
    },
    installScrollRoot(root: HTMLElement) {
      root.addEventListener = vi.fn((type: string, listener: EventListener) => {
        if (type === 'scroll')
          scrollListeners.set(root, listener)
      }) as any
      root.removeEventListener = vi.fn() as any
    },
    dispatchScroll(root: HTMLElement, count: number) {
      const listener = scrollListeners.get(root)
      if (!listener)
        throw new Error('no scroll listener installed')
      for (let i = 0; i < count; i++)
        listener(new Event('scroll'))
    },
  }
}

describe('streaming coalescing perf guards', () => {
  let platform: ReturnType<typeof installFramePlatform>

  beforeEach(() => {
    platform = installFramePlatform()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('p5: 120 scroll events in one frame cause one scrollTop observation', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)
    platform.installScrollRoot(scrollRoot)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        viewportPriority: false,
        maxLiveNodes: 0,
        virtualScroll: {
          enabled: true,
          sessionKey: 'p5-scroll-coalesce',
          scrollRoot: () => scrollRoot,
          emitIntervalMs: 0,
        },
      },
    })
    await flushAll()
    platform.flushFrames()
    platform.scrollTopSpy.mockClear()

    // 120 scroll events before the next frame. With P5 the scrollTop read is
    // deferred to a single rAF observation, so no reads happen synchronously.
    platform.dispatchScroll(scrollRoot, 120)
    expect(platform.scrollTopSpy.mock.calls.length).toBe(0)

    platform.flushFrames()
    // One coalesced observation ran in the frame; its intrinsic reads are
    // resolveFocusSyncScheduleOptions (1) + syncFocusToScroll (1) = 2. Before
    // the change, 120 events each read scrollTop synchronously (120+ reads).
    console.log('P5 scrollTop reads after frame:', platform.scrollTopSpy.mock.calls.length)
    expect(platform.scrollTopSpy.mock.calls.length).toBeGreaterThan(0)
    expect(platform.scrollTopSpy.mock.calls.length).toBeLessThan(5)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('p4: focus sync after a streaming commit is deferred to one rAF', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)
    platform.installScrollRoot(scrollRoot)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        viewportPriority: false,
        maxLiveNodes: 0,
        virtualScroll: {
          enabled: true,
          sessionKey: 'p4-focus-dedupe',
          scrollRoot: () => scrollRoot,
          emitIntervalMs: 0,
        },
      },
    })
    await flushAll()
    platform.flushFrames()
    platform.scrollTopSpy.mockClear()

    // Streaming commit: parsedNodes.length and renderedCount watchers fire.
    await wrapper.setProps({ nodes: [createParagraph(1), createParagraph(2), createParagraph(3), createParagraph(4)] })
    await flushAll()

    // The commit's focus sync must be coalesced into a single rAF (deferred),
    // not run synchronously three times.
    expect(platform.scrollTopSpy.mock.calls.length).toBe(0)
    expect(platform.frames.length).toBeGreaterThanOrEqual(1)

    platform.flushFrames()
    wrapper.unmount()
    scrollRoot.remove()
  })
})
