import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'

const mocks = vi.hoisted(() => ({
  renderKaTeXWithBackpressure: vi.fn(() => new Promise<string>(() => {})),
}))

vi.mock('../src/components/MathInlineNode/katex', () => ({
  getKatexSync: () => null,
  getKatex: async () => null,
}))

vi.mock('../src/workers/katexWorkerClient', async () => {
  const actual: any = await vi.importActual('../src/workers/katexWorkerClient')
  return {
    ...actual,
    renderKaTeXWithBackpressure: mocks.renderKaTeXWithBackpressure,
  }
})

// flushAll() in ./setup uses real setTimeout, which deadlocks under fake
// timers; use microtask-only flushing here.
async function flushVue() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('mathBlockNode render coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.renderKaTeXWithBackpressure.mockClear()
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deduplicates identical content updates', async () => {
    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: 'x^2',
          raw: '$$x^2$$',
          loading: true,
        },
      },
    })

    await flushVue()

    // Same logical content pushed again (e.g. parser re-emits the same node)
    await wrapper.setProps({
      node: {
        type: 'math_block',
        content: 'x^2',
        raw: '$$x^2$$',
        loading: true,
      },
    })
    await flushVue()

    expect(mocks.renderKaTeXWithBackpressure).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('coalesces rapid streaming appends into a single render burst', async () => {
    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: 'x',
          raw: '$$x$$',
          loading: true,
        },
      },
    })

    await flushVue()

    // Simulate token appends arriving faster than the coalesce window
    for (const content of ['x+1', 'x+1+2', 'x+1+2+3', 'x+1+2+3+4']) {
      await wrapper.setProps({
        node: {
          type: 'math_block',
          content,
          raw: `$$${content}$$`,
          loading: true,
        },
      })
    }
    await flushVue()

    // No render yet: the coalesce timer is pending
    expect(mocks.renderKaTeXWithBackpressure).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(40)
    await flushVue()

    // All four appends merged into one additional render
    expect(mocks.renderKaTeXWithBackpressure).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('renders immediately when loading flips to false', async () => {
    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: 'x',
          raw: '$$x$$',
          loading: true,
        },
      },
    })

    await flushVue()

    const node = {
      type: 'math_block',
      content: 'x+1',
      raw: '$$x+1$$',
      loading: false,
    }
    await wrapper.setProps({ node })
    await flushVue()

    // Final content renders without waiting for the coalesce window
    expect(mocks.renderKaTeXWithBackpressure.mock.calls.map(call => call[0])).toContain('x+1')

    wrapper.unmount()
  })
})
