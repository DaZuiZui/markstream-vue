import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'
import { MermaidBlockNodeLoading } from '../src/components/NodeRenderer/MermaidBlockNodeLoading'

async function renderWithMaxHeight(maxHeight: string) {
  const wrapper = mount(MermaidBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'graph LR\nA-->B\n',
        raw: '```mermaid\ngraph LR\nA-->B\n```',
      },
      loading: false,
      maxHeight,
    },
    attachTo: document.body,
  })

  ;(wrapper.vm as any).mermaidAvailable = true
  ;(wrapper.vm as any).showSource = false
  await nextTick()

  const content = wrapper.get('div._mermaid').element as HTMLElement
  content.innerHTML = '<svg viewBox="0 0 100 200"></svg>'

  const wrapperEl = wrapper.get('[data-mermaid-wrapper]').element as HTMLElement
  const container = wrapperEl.parentElement as HTMLElement
  Object.defineProperty(container, 'clientWidth', {
    configurable: true,
    value: 1000,
  })

  const setupState = (wrapper.vm as any).$?.setupState
  setupState.updateContainerHeight()
  await nextTick()

  return { wrapper, container, content }
}

describe('mermaid block max height', () => {
  it('keeps intrinsic loading layout optimization outside streaming mode', () => {
    const baseProps = {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'graph TD\nA-->B\n',
        raw: '```mermaid\ngraph TD\nA-->B\n```',
      },
    }
    const optimized = mount(MermaidBlockNodeLoading, { props: baseProps })
    const optimizedMermaid = optimized.get('div._mermaid').element as HTMLElement
    expect(optimizedMermaid.style.contentVisibility).toBe('auto')
    expect(optimizedMermaid.style.contain).toBe('content')
    expect(optimizedMermaid.style.containIntrinsicSize).toBe('var(--ms-size-diagram-min-height) 240px')
    optimized.unmount()

    const streaming = mount(MermaidBlockNodeLoading, {
      props: { ...baseProps, streamingLayout: true },
    })
    const streamingMermaid = streaming.get('div._mermaid').element as HTMLElement
    expect(streamingMermaid.style.contentVisibility).toBe('visible')
    expect(streamingMermaid.style.contain).toBe('none')
    expect(streamingMermaid.style.containIntrinsicSize).toBe('none')
    streaming.unmount()
  })

  it('keeps the live diagram in normal layout while streaming', async () => {
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph TD\nA-->B\n',
          raw: '```mermaid\ngraph TD\nA-->B\n```',
        },
        loading: true,
      },
    })

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    await nextTick()
    expect(wrapper.get('div._mermaid').classes()).toContain('is-streaming')
    await wrapper.setProps({ loading: false, streamingLayout: true })
    await nextTick()
    expect(wrapper.get('div._mermaid').classes()).toContain('is-streaming')
    const source = readFileSync('src/components/MermaidBlockNode/MermaidBlockNode.vue', 'utf8')
    expect(source).toContain('._mermaid.is-streaming {')
    expect(source).toContain('content-visibility: visible;')
    wrapper.unmount()
  })

  it('caps preview height unless maxHeight is none', async () => {
    const capped = await renderWithMaxHeight('500px')
    expect(capped.container.style.height).toBe('500px')
    expect(capped.content.style.height).toBe('500px')
    capped.wrapper.unmount()

    const uncapped = await renderWithMaxHeight('none')
    expect(uncapped.container.style.height).toBe('2000px')
    expect(uncapped.content.style.height).toBe('2000px')
    uncapped.wrapper.unmount()
  })

  it('keeps preview height frozen while streaming after an SVG exists', async () => {
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph LR\nA-->B\n',
          raw: '```mermaid\ngraph LR\nA-->B\n```',
        },
        loading: true,
        estimatedPreviewHeightPx: 360,
      },
      attachTo: document.body,
    })

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    await nextTick()

    const content = wrapper.get('div._mermaid').element as HTMLElement
    content.innerHTML = '<svg viewBox="0 0 100 200"></svg>'

    const wrapperEl = wrapper.get('[data-mermaid-wrapper]').element as HTMLElement
    const container = wrapperEl.parentElement as HTMLElement
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 1000,
    })

    const setupState = (wrapper.vm as any).$?.setupState
    setupState.updateContainerHeight()
    await nextTick()

    expect(container.style.height).toBe('360px')
    expect(content.style.height).toBe('360px')

    await wrapper.setProps({ loading: false })
    setupState.updateContainerHeight(undefined, { force: true })
    await nextTick()

    expect(container.style.height).toBe('360px')
    expect(content.style.height).toBe('360px')
    wrapper.unmount()
  })

  it('sizes capped preview content to the preview height', async () => {
    const { wrapper } = await renderWithMaxHeight('500px')
    const content = wrapper.get('div._mermaid').element as HTMLElement

    expect(content.style.height).toBe('500px')

    wrapper.unmount()
  })

  it('does not paint-contain fullscreen SVG content at the preview height', async () => {
    const { wrapper, content } = await renderWithMaxHeight('500px')
    content.innerHTML = '<svg viewBox="0 0 100 200"></svg>'

    ;(wrapper.vm as any).openModal()
    await nextTick()
    await nextTick()

    const modalContent = document.body.querySelector<HTMLElement>('[data-mermaid-modal-clone="1"] ._mermaid')
    expect(modalContent?.style.height).toBe('500px')
    expect(modalContent?.style.contain).toBe('none')
    expect(modalContent?.style.contentVisibility).toBe('visible')

    wrapper.unmount()
  })

  it('keeps the unscaled height when zoomed out (getBoundingClientRect is transform-affected)', async () => {
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph LR\nA-->B\n',
          raw: '```mermaid\ngraph LR\nA-->B\n```',
        },
        loading: false,
        maxHeight: 'none',
      },
      attachTo: document.body,
    })

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    await nextTick()

    const content = wrapper.get('div._mermaid').element as HTMLElement
    content.innerHTML = '<svg viewBox="0 0 100 2000"></svg>'
    const svg = content.querySelector('svg') as SVGElement

    const wrapperEl = wrapper.get('[data-mermaid-wrapper]').element as HTMLElement
    const container = wrapperEl.parentElement as HTMLElement
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 1000,
    })

    const setupState = (wrapper.vm as any).$?.setupState
    // Simulate zoom = 0.5: browsers return the *scaled* visual width from
    // getBoundingClientRect() (jsdom itself always reports 0, so stub it).
    setupState.zoom = 0.5
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 50, height: 1000 }),
    })

    setupState.updateContainerHeight()
    await nextTick()

    // Unscaled width is 50 / 0.5 = 100 -> height = 100 * (2000 / 100) = 2000px.
    // Regression: the scaled width (50) was used directly, shrinking the
    // content height to 1000px and cropping the diagram after collapse/expand.
    expect(content.style.height).toBe('2000px')

    wrapper.unmount()
  })
})
