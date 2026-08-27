/**
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import HtmlBlockNode from '../src/components/HtmlBlockNode/HtmlBlockNode.vue'

describe('htmlBlockNode streaming DOM stability', () => {
  // Unmount wrappers before the environment tears down. Leaving a mounted
  // renderer alive lets its pending async-component loads resolve after the
  // jsdom teardown, which surfaces as an EnvironmentTeardownError unhandled
  // rejection and fails the whole worker.
  const wrappers: VueWrapper<any>[] = []
  afterEach(async () => {
    while (wrappers.length) {
      const wrapper = wrappers.pop()
      if (wrapper) {
        try {
          await flushPromises()
          await nextTick()
          wrapper.unmount()
        }
        catch {}
      }
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  function trackMount(component: any, options: Record<string, unknown>) {
    const wrapper = mount(component, options as any)
    wrappers.push(wrapper as VueWrapper<any>)
    return wrapper
  }
  it('keeps table element stable while loading content grows', async () => {
    const nodeA = {
      type: 'html_block',
      tag: 'table',
      raw: '<table><tr><td>1</td></tr>',
      content: '<table><tr><td>1</td></tr></table>',
      loading: true,
    } as const

    const wrapper = trackMount(HtmlBlockNode, {
      props: {
        node: nodeA as any,
      },
    })

    await nextTick()
    const first = wrapper.find('table').element

    const nodeB = {
      ...nodeA,
      raw: '<table><tr><td>1</td></tr><tr><td>2</td></tr>',
      content: '<table><tr><td>1</td></tr><tr><td>2</td></tr></table>',
      loading: true,
    } as const

    await wrapper.setProps({ node: nodeB as any })
    await nextTick()

    const second = wrapper.find('table').element
    expect(second).toBe(first)
  })

  it('keeps the streamed HTML subtree mounted when loading settles', async () => {
    const loadingNode = {
      type: 'html_block',
      tag: 'div',
      raw: '<div><table><tr><td>1</td></tr>',
      content: '<div><table><tr><td>1</td></tr>',
      loading: true,
    } as const
    const wrapper = trackMount(HtmlBlockNode, { props: { node: loadingNode as any } })
    await nextTick()
    const first = wrapper.find('table').element

    await wrapper.setProps({
      node: {
        ...loadingNode,
        raw: '<div><table><tr><td>1</td></tr></table></div>',
        content: '<div><table><tr><td>1</td></tr></table></div>',
        loading: false,
      } as any,
    })
    await nextTick()

    expect(wrapper.find('table').element).toBe(first)
  })

  it('renders the final content instead of stale structured children', async () => {
    const loadingNode = {
      type: 'html_block',
      tag: 'div',
      raw: '<div><ul><li>',
      content: '<div><ul><li></li></ul></div>',
      loading: true,
      children: [{
        type: 'code_block',
        language: 'plaintext',
        code: 'stale intermediate parse',
        raw: '    stale intermediate parse',
      }],
    }
    const wrapper = trackMount(HtmlBlockNode, { props: { node: loadingNode as any } })
    await nextTick()

    await wrapper.setProps({
      node: {
        type: 'html_block',
        tag: 'div',
        raw: '<div><ul><li>fresh final content</li></ul></div>',
        content: '<div><ul><li>fresh final content</li></ul></div>',
        loading: false,
      } as any,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('fresh final content')
    expect(wrapper.text()).not.toContain('stale intermediate parse')
  })
})
