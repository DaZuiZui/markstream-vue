/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

describe('text node streaming selection', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountRenderer(content: string) {
    return mount(NodeRenderer, {
      props: {
        content,
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        parseCoalesceMs: 0,
      },
      attachTo: document.body,
    })
  }

  function selectText(node: Text, start: number, end: number) {
    const sel = document.getSelection()
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, end)
    sel?.removeAllRanges()
    sel?.addRange(range)
    return sel?.toString() ?? ''
  }

  it('keeps the settled text node identity and a selection across streaming settles', async () => {
    const first = 'The quick brown fox jumps over the lazy dog.'
    const content = `${first} And then some more words to stream in later. And even more trailing text arrives after that.`

    const wrapper = mountRenderer('')
    try {
      await wrapper.setProps({ content: first })
      await flushAll()

      const settledSpan = wrapper.find('.text-node > span:first-child')
      const textNodeBefore = settledSpan.element.firstChild as Text
      expect(textNodeBefore.nodeType).toBe(Node.TEXT_NODE)
      expect(textNodeBefore.textContent).toBe(first)

      const selectedBefore = selectText(textNodeBefore, 4, 15)
      expect(selectedBefore).toBe('quick brown')

      // Streaming append: the settled node must not be replaced.
      await wrapper.setProps({ content: `${first} And then some more words to stream in later.` })
      await flushAll()
      const textNodeAfter = wrapper.find('.text-node > span:first-child').element.firstChild as Text | null
      expect(textNodeAfter, 'settled text node identity preserved across streaming append').toBe(textNodeBefore)
      expect(document.getSelection()?.toString() ?? '', 'selection survives the streaming append').toBe(selectedBefore)

      // Settle: the delta merges into the settled content — again without
      // replacing or mutating the settled text node.
      await wrapper.setProps({ content })
      await flushAll()
      const textNodeFinal = wrapper.find('.text-node > span:first-child').element.firstChild as Text | null
      expect(textNodeFinal, 'settled text node identity preserved across settle').toBe(textNodeBefore)
      expect(textNodeBefore.textContent).toBe(first)
      expect(document.getSelection()?.toString() ?? '', 'selection survives the settle').toBe(selectedBefore)

      // The full content must still render (settled + appended increments).
      const outer = wrapper.find('.text-node')
      expect(outer.element.textContent ?? '').toBe(content)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps a selection across appends when typewriter is off', async () => {
    const first = 'The quick brown fox jumps over the lazy dog.'
    const second = `${first} And then some more words to stream in later.`

    const wrapper = mount(NodeRenderer, {
      props: {
        content: first,
        typewriter: false,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        parseCoalesceMs: 0,
      },
      attachTo: document.body,
    })
    try {
      await flushAll()
      const settledSpan = wrapper.find('.text-node > span:first-child')
      const textNodeBefore = settledSpan.element.firstChild as Text
      const selectedBefore = selectText(textNodeBefore, 4, 15)
      expect(selectedBefore).toBe('quick brown')

      await wrapper.setProps({ content: second })
      await flushAll()
      const textNodeAfter = wrapper.find('.text-node > span:first-child').element.firstChild as Text | null
      expect(textNodeAfter, 'settled text node identity preserved (typewriter off)').toBe(textNodeBefore)
      expect(document.getSelection()?.toString() ?? '', 'selection survives (typewriter off)').toBe(selectedBefore)
    }
    finally {
      wrapper.unmount()
    }
  })
})
