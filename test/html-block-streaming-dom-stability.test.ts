/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import HtmlBlockNode from '../src/components/HtmlBlockNode/HtmlBlockNode.vue'

describe('htmlBlockNode streaming DOM stability', () => {
  it('keeps table element stable while loading content grows', async () => {
    const nodeA = {
      type: 'html_block',
      tag: 'table',
      raw: '<table><tr><td>1</td></tr>',
      content: '<table><tr><td>1</td></tr></table>',
      loading: true,
    } as const

    const wrapper = mount(HtmlBlockNode, {
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
    const wrapper = mount(HtmlBlockNode, { props: { node: loadingNode as any } })
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
})
