import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import InfographicBlockNode from '../src/components/InfographicBlockNode/InfographicBlockNode.vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'

function diagramNode(language: string, code: string) {
  return {
    type: 'code_block',
    language,
    code,
    raw: `\`\`\`${language}\n${code}\`\`\``,
  }
}

/**
 * jsdom/happy-dom do not implement CSS custom property inheritance, so
 * getComputedStyle cannot observe a token set on an ancestor. The token-driven
 * tests stub `getComputedStyle` directly to cover the custom-property lookup
 * path; the fallback tests leave the real (token-less) implementation and
 * expect the built-in 360px default.
 */
async function mountDiagramInPreview(component: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const wrapper = mount(component as any, {
    props: props as any,
    attachTo: host,
  })
  await nextTick()

  // The preview host only mounts once the block leaves source mode. Flip it
  // off so the container ref used by resolveMinContainerHeight() is bound.
  const state = (wrapper.vm as any).$?.setupState
  state.showSource = false
  await nextTick()

  return { wrapper, host, state }
}

function stubDiagramMinHeight(value: string) {
  const stub = vi.fn((_el: Element) => ({
    getPropertyValue: (prop: string) => (prop === '--ms-size-diagram-min-height' ? value : ''),
  })) as unknown as typeof window.getComputedStyle
  vi.stubGlobal('getComputedStyle', stub)
  return () => {
    vi.unstubAllGlobals()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('diagram preview min-height fallback (--ms-size-diagram-min-height)', () => {
  it('mermaid falls back to 360 without the token', async () => {
    const { wrapper, host, state } = await mountDiagramInPreview(MermaidBlockNode, {
      node: diagramNode('mermaid', 'graph LR\nA-->B\n'),
      loading: false,
    })
    expect(state.resolveMinContainerHeight()).toBe(360)
    wrapper.unmount()
    host.remove()
  })

  it('mermaid resolves min-height from the token', async () => {
    const restore = stubDiagramMinHeight('420px')
    try {
      const { wrapper, host, state } = await mountDiagramInPreview(MermaidBlockNode, {
        node: diagramNode('mermaid', 'graph LR\nA-->B\n'),
        loading: false,
      })
      expect(state.resolveMinContainerHeight()).toBe(420)
      wrapper.unmount()
      host.remove()
    }
    finally {
      restore()
    }
  })

  it('mermaid accepts the estimatedPreviewHeightPx prop', async () => {
    const { wrapper, host, state } = await mountDiagramInPreview(MermaidBlockNode, {
      node: diagramNode('mermaid', 'graph LR\nA-->B\n'),
      loading: false,
      estimatedPreviewHeightPx: 100,
    })
    expect(state.resolveEstimatedPreviewHeight()).toBeGreaterThanOrEqual(360)
    wrapper.unmount()
    host.remove()
  })

  it('infographic falls back to 360 without the token', async () => {
    const { wrapper, host, state } = await mountDiagramInPreview(InfographicBlockNode, {
      node: diagramNode('infographic', '- Start\n- Step 1\n'),
      loading: false,
      estimatedPreviewHeightPx: 100,
    })
    expect(state.resolveMinContainerHeight()).toBe(360)
    expect(state.estimatedPreviewHeight).toBe(360)
    wrapper.unmount()
    host.remove()
  })

  it('infographic resolves min-height from the token', async () => {
    const restore = stubDiagramMinHeight('420px')
    try {
      const { wrapper, host, state } = await mountDiagramInPreview(InfographicBlockNode, {
        node: diagramNode('infographic', '- Start\n- Step 1\n'),
        loading: false,
        estimatedPreviewHeightPx: 100,
      })
      expect(state.resolveMinContainerHeight()).toBe(420)
      expect(state.estimatedPreviewHeight).toBe(420)
      wrapper.unmount()
      host.remove()
    }
    finally {
      restore()
    }
  })
})
