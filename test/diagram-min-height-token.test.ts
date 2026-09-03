import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
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
 * Note: the jsdom/happy-dom test environment does not implement CSS custom
 * property inheritance, so getComputedStyle on a descendant cannot observe a
 * token set on an ancestor. These tests therefore only cover the fallback
 * path; the token-driven path is verified in real browsers (the docs site
 * scopes --ms-size-diagram-min-height on the renderer root).
 */
function mountDiagram(component: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const wrapper = mount(component as any, {
    props: props as any,
    attachTo: host,
  })
  return { wrapper, host }
}

describe('diagram preview min-height fallback (--ms-size-diagram-min-height)', () => {
  it('mermaid falls back to 360 without the token', async () => {
    const { wrapper, host } = mountDiagram(MermaidBlockNode, {
      node: diagramNode('mermaid', 'graph LR\nA-->B\n'),
      loading: false,
    })
    await nextTick()
    const state = (wrapper.vm as any).$?.setupState
    expect(state.resolveMinContainerHeight()).toBe(360)
    wrapper.unmount()
    host.remove()
  })

  it('mermaid accepts the estimatedPreviewHeightPx prop', async () => {
    const { wrapper, host } = mountDiagram(MermaidBlockNode, {
      node: diagramNode('mermaid', 'graph LR\nA-->B\n'),
      loading: false,
      estimatedPreviewHeightPx: 100,
    })
    await nextTick()
    const state = (wrapper.vm as any).$?.setupState
    expect(state.resolveEstimatedPreviewHeight()).toBeGreaterThanOrEqual(360)
    wrapper.unmount()
    host.remove()
  })

  it('infographic falls back to 360 without the token', async () => {
    const { wrapper, host } = mountDiagram(InfographicBlockNode, {
      node: diagramNode('infographic', '- Start\n- Step 1\n'),
      loading: false,
      estimatedPreviewHeightPx: 100,
    })
    await nextTick()
    const state = (wrapper.vm as any).$?.setupState
    expect(state.resolveMinContainerHeight()).toBe(360)
    expect(state.estimatedPreviewHeight).toBe(360)
    wrapper.unmount()
    host.remove()
  })
})
