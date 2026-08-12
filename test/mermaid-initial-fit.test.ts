import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'

/**
 * Mounts the block with a stub SVG whose *natural* (unscaled) size is
 * `naturalW x naturalH`, rendered at the given zoom. getBoundingClientRect is
 * stubbed to the zoomed (visual) size, matching real browser behavior.
 */
async function mountStub({
  naturalW,
  naturalH,
  areaW = 1000,
  areaH = 500,
  zoom = 1,
}: {
  naturalW: number
  naturalH: number
  areaW?: number
  areaH?: number
  zoom?: number
}) {
  const wrapper = mount(MermaidBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'graph LR\nA-->B\n',
        raw: '```mermaid\ngraph LR\nA-->B\n```',
      },
      loading: false,
    },
    attachTo: document.body,
  })

  ;(wrapper.vm as any).mermaidAvailable = true
  ;(wrapper.vm as any).showSource = false
  await nextTick()

  const ss = (wrapper.vm as any).$?.setupState
  ss.zoom = zoom
  const content = wrapper.get('div._mermaid').element as HTMLElement
  content.innerHTML = '<svg viewBox="0 0 100 200"></svg>'
  const svg = content.querySelector('svg')!
  const area = wrapper.get('.mermaid-preview-area').element as HTMLElement
  Object.defineProperty(area, 'clientWidth', { configurable: true, value: areaW })
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: areaH })
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: naturalW * zoom, height: naturalH * zoom }),
  })
  return { wrapper, ss }
}

/** Wait for the settle loop + microtasks to finish. */
async function flushFit() {
  await new Promise(resolve => setTimeout(resolve, 100))
  await nextTick()
}

describe('mermaid initial fit (fitWhenSettled)', () => {
  it('zooms out and centers when content overflows the preview area', async () => {
    const { wrapper, ss } = await mountStub({ naturalW: 1000, naturalH: 2000 })
    await ss.fitWhenSettled()
    await flushFit()

    expect(ss.zoom).toBe(0.5)
    expect(ss.translateX).toBe(250) // (1000 - 1000*0.5)/2
    expect(ss.translateY).toBe(-250) // (500 - 2000*0.5)/2
    wrapper.unmount()
  })

  it('keeps identity transform when content fits', async () => {
    const { wrapper, ss } = await mountStub({ naturalW: 400, naturalH: 200 })
    await ss.fitWhenSettled()
    await flushFit()

    expect(ss.zoom).toBe(1)
    expect(ss.translateX).toBe(0)
    expect(ss.translateY).toBe(0)
    wrapper.unmount()
  })

  it('does not override the transform after the user adjusted it', async () => {
    const { wrapper, ss } = await mountStub({ naturalW: 1000, naturalH: 2000, zoom: 0.8 })
    ss.userHasAdjustedTransform = true
    ss.translateX = 12
    ss.translateY = 34
    await ss.fitWhenSettled()
    await flushFit()

    expect(ss.zoom).toBe(0.8)
    expect(ss.translateX).toBe(12)
    expect(ss.translateY).toBe(34)
    wrapper.unmount()
  })

  it('resetZoom returns to the fitted default view', async () => {
    const { wrapper, ss } = await mountStub({ naturalW: 1000, naturalH: 2000, zoom: 1.4 })
    ss.userHasAdjustedTransform = true
    ss.resetZoom()
    await flushFit()

    expect(ss.zoom).toBe(0.5)
    expect(ss.translateX).toBeCloseTo(250, 6)
    expect(ss.translateY).toBeCloseTo(-250, 6)
    wrapper.unmount()
  })
})