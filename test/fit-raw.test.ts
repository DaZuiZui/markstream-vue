import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'

interface FitApi {
  applyFitToArea: (area: any, svg: any) => void
  zoom: number
  translateX: number
  translateY: number
  userHasAdjustedTransform: any
  resetZoom: () => void
}

async function mountForFit(zoom = 1): Promise<{
  wrapper: ReturnType<typeof mount>
  area: HTMLElement
  svg: SVGElement
  api: FitApi
}> {
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

  const ss: any = (wrapper.vm as any).$?.setupState
  ss.mermaidAvailable = false
  ss.showSource = false
  await nextTick()

  ss.zoom = zoom
  await nextTick()
  const content = ss.mermaidContent as HTMLElement | undefined
  if (!content)
    throw new Error('mermaidContent ref null')

  content.innerHTML = '<svg viewBox="0 0 100 200"></svg>'
  const svg = content.querySelector('svg')!
  const area = ss.mermaidContainer as HTMLElement | undefined
  if (!area)
    throw new Error('mermaidContainer null')

  Object.defineProperty(area, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: 500 })

  return {
    wrapper,
    area,
    svg,
    api: {
      applyFitToArea: ss.applyFitToArea.bind(ss),
      get zoom() { return ss.zoom },
      get translateX() { return ss.translateX },
      get translateY() { return ss.translateY },
      userHasAdjustedTransform: ss.userHasAdjustedTransform,
      resetZoom: ss.resetZoom.bind(ss),
    },
  }
}

describe('applyFitToArea raw', () => {
  it('zooms out and centers when overflow', async () => {
    const { area, svg, api, wrapper } = await mountForFit()
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1000, height: 2000 }),
    })
    api.applyFitToArea(area, svg)
    expect(api.zoom).toBe(0.5)
    expect(api.translateX).toBeCloseTo(250, 6)
    expect(api.translateY).toBeCloseTo(-250, 6)
    wrapper.unmount()
  })

  it('keeps identity when fits', async () => {
    const { area, svg, api, wrapper } = await mountForFit()
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 400, height: 200 }),
    })
    api.applyFitToArea(area, svg)
    expect(api.zoom).toBe(1)
    expect(api.translateX).toBe(0)
    expect(api.translateY).toBe(0)
    wrapper.unmount()
  })
})
