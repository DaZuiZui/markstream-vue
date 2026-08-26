/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useStickToBottom } from '../src/composables/useStickToBottom'

function touchEvent(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'touches', { value: [{ clientY }] })
  return event
}

describe('useStickToBottom', () => {
  it('unpins only for explicit scroll intent', async () => {
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

    const contentEditable = document.createElement('div')
    contentEditable.setAttribute('contenteditable', 'true')
    const editableTargets = [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      contentEditable,
    ]
    for (const target of editableTargets) {
      root.append(target)
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }))
      expect(controller.bottomPinned.value).toBe(true)
    }

    root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'PageUp' }))
    expect(controller.bottomPinned.value).toBe(false)

    scrollTop = 711
    root.dispatchEvent(new Event('scroll'))
    root.dispatchEvent(touchEvent('touchstart', 100))
    root.dispatchEvent(touchEvent('touchmove', 104))
    expect(controller.bottomPinned.value).toBe(true)

    root.dispatchEvent(touchEvent('touchmove', 107))
    expect(controller.bottomPinned.value).toBe(false)

    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
