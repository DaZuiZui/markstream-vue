/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useStickToBottom } from '../src/composables/useStickToBottom'

describe('useStickToBottom', () => {
  it('ignores layout scroll events and unpins on the first upward wheel', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })

    const Harness = defineComponent({
      setup(_, { expose }) {
        const scrollRoot = ref<HTMLElement | null>(null)
        const contentRoot = ref<HTMLElement | null>(null)
        const controller = useStickToBottom(scrollRoot, contentRoot)
        expose({ controller, scrollRoot })
        return { scrollRoot, contentRoot }
      },
      template: '<div ref="scrollRoot"><div ref="contentRoot" /></div>',
    })
    const wrapper = mount(Harness)
    await nextTick()

    const root = wrapper.element as HTMLElement
    let scrollHeight = 1000
    let scrollTop = 600
    Object.defineProperties(root, {
      clientHeight: { configurable: true, get: () => 400 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: value => scrollTop = Number(value),
      },
    })
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => scrollTop = Number(top))
    root.scrollTo = scrollTo
    const controller = (wrapper.vm as any).controller

    scrollHeight = 1111
    root.dispatchEvent(new Event('scroll'))
    expect(controller.bottomPinned.value).toBe(true)
    expect(frames).toHaveLength(1)
    frames.shift()!(0)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1111, behavior: 'auto' })

    root.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 }))
    scrollTop = 500
    root.dispatchEvent(new Event('scroll'))
    expect(controller.bottomPinned.value).toBe(false)

    scrollTop = 711
    root.dispatchEvent(new Event('scroll'))
    expect(controller.bottomPinned.value).toBe(true)

    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
