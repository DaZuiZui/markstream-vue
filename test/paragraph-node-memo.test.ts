/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import ParagraphNode from '../src/components/ParagraphNode'
import TextNode from '../src/components/TextNode'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

describe('paragraph child memo', () => {
  const customId = 'paragraph-child-memo'

  afterEach(() => {
    removeCustomComponents(customId)
  })

  it('keeps content-identical text children stable while updating the changed tail', async () => {
    const first = { type: 'text', raw: 'stable', content: 'stable' }
    const tail = { type: 'text', raw: 'a', content: 'a' }
    const wrapper = mount(ParagraphNode, {
      props: {
        node: { type: 'paragraph', raw: 'stable a', children: [first, tail] },
        indexKey: 'memo',
      },
    })

    const initialTextNodes = wrapper.findAllComponents(TextNode)
    const stableNodeProp = initialTextNodes[0].props('node')
    const tailNodeProp = initialTextNodes[1].props('node')

    const nextTail = { type: 'text', raw: 'ab', content: 'ab' }
    await wrapper.setProps({
      node: {
        type: 'paragraph',
        raw: 'stable ab',
        children: [
          { type: 'text', raw: 'stable', content: 'stable' },
          nextTail,
        ],
      },
    })

    const updatedTextNodes = wrapper.findAllComponents(TextNode)
    expect(updatedTextNodes[0].props('node')).toBe(stableNodeProp)
    expect(updatedTextNodes[1].props('node')).not.toBe(tailNodeProp)
    expect(updatedTextNodes[1].props('node')).toMatchObject(nextTail)
  })

  it('updates a finalized image when its URL changes with the same alt text', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '![x](https://a.test/a.png)',
        final: true,
        typewriter: false,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    expect(wrapper.find('img').attributes('src')).toBe('https://a.test/a.png')

    await wrapper.setProps({ content: '![x](https://b.test/b.png)' })
    await flushAll()

    expect(wrapper.find('img').attributes('src')).toBe('https://b.test/b.png')
  })

  it('updates recursive custom children when their content changes at the same length', async () => {
    const CustomNode = defineComponent({
      setup(_props, { slots }) {
        return () => h('span', { class: 'custom-node' }, slots.default?.())
      },
    })
    setCustomComponents(customId, { thinking: CustomNode })
    const makeNode = (content: string) => ({
      type: 'paragraph' as const,
      raw: 'same paragraph',
      children: [{
        type: 'thinking',
        raw: 'same child',
        content: 'same child',
        loading: false,
        children: [{ type: 'text', raw: content, content }],
      }],
    })
    const wrapper = mount(ParagraphNode, {
      props: {
        node: makeNode('first'),
        customId,
        indexKey: 'recursive',
      },
    })

    await flushAll()
    expect(wrapper.find('.custom-node').text()).toBe('first')

    await wrapper.setProps({ node: makeNode('second') })
    await flushAll()

    expect(wrapper.find('.custom-node').text()).toBe('second')
  })
})
