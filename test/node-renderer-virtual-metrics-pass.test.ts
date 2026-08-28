import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('reads each node height once during a full metrics emission', async () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    constructor(_callback: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  })

  let nodeHeightReads = 0
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    if (this.classList.contains('node-content')) {
      nodeHeightReads++
      return 40
    }
    if (this.classList.contains('node-slot')) {
      nodeHeightReads++
      return 40
    }
    return 0
  })

  const NodeRenderer = (await import('../src/components/NodeRenderer')).default
  const wrapper = mount(NodeRenderer, {
    props: {
      nodes: Array.from({ length: 4 }, (_, index) => ({
        type: 'paragraph',
        raw: `Paragraph ${index}`,
        children: [{ type: 'text', raw: `Paragraph ${index}`, content: `Paragraph ${index}` }],
      })),
      final: true,
      fade: false,
      viewportPriority: false,
      virtualScroll: {
        enabled: true,
        sessionKey: 'dom-pass',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    },
  })

  await nextTick()
  nodeHeightReads = 0
  let emissionReads: number | undefined
  for (let index = 0; index < 20 && frames.length; index++) {
    const callback = frames.shift()!
    const eventsBefore = wrapper.emitted('height-change')?.length ?? 0
    const readsBefore = nodeHeightReads
    callback(performance.now())
    await nextTick()
    const eventsAfter = wrapper.emitted('height-change')?.length ?? 0
    if (eventsAfter > eventsBefore) {
      emissionReads = nodeHeightReads - readsBefore
      break
    }
  }

  expect(emissionReads).toBe(4)
  wrapper.unmount()
})
