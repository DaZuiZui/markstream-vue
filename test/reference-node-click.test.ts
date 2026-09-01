/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import MarkdownRender from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

function paragraphWithReference(reference: Record<string, unknown>) {
  return {
    type: 'paragraph',
    raw: '[741]',
    children: [reference],
  }
}

describe('reference node click', () => {
  afterEach(() => removeCustomComponents('reference-click-test'))

  it.each([
    ['paragraph', { type: 'reference', id: '741', raw: '[741]' }],
    [
      'nested inline node',
      {
        type: 'strong',
        raw: '**[741]**',
        children: [{ type: 'reference', id: '741', raw: '[741]' }],
      },
    ],
  ])('forwards the reference id from a %s', async (_name, reference) => {
    const onClick = vi.fn()
    const wrapper = mount(MarkdownRender, {
      props: {
        nodes: [paragraphWithReference(reference)] as any,
        onClick,
      },
    })
    await flushAll()

    await wrapper.get('.reference-node').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent)
    expect(onClick.mock.calls[0]?.[1]).toBe('741')
  })

  it('keeps emitting ordinary clicks without a reference id', async () => {
    const onClick = vi.fn()
    const wrapper = mount(MarkdownRender, {
      props: {
        nodes: [{
          type: 'paragraph',
          raw: 'text',
          children: [{ type: 'text', content: 'text', raw: 'text' }],
        }] as any,
        onClick,
      },
    })
    await flushAll()

    await wrapper.get('.paragraph-node').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent)
    expect(onClick.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('does not read a reference id outside the renderer boundary', async () => {
    const onClick = vi.fn()
    const wrapper = mount(defineComponent({
      setup: () => () => h('div', { 'data-markstream-reference-id': 'outside' }, [
        h(MarkdownRender, {
          nodes: [{
            type: 'paragraph',
            raw: 'text',
            children: [{ type: 'text', content: 'text', raw: 'text' }],
          }] as any,
          onClick,
        }),
      ]),
    }))
    await flushAll()

    await wrapper.get('.paragraph-node').trigger('click')

    expect(onClick.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('does not treat user-authored data-reference-id HTML as a reference node', async () => {
    const onClick = vi.fn()
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '<span data-reference-id="user-data">text</span>',
        onClick,
      },
    })
    await flushAll()

    await wrapper.get('[data-reference-id="user-data"]').trigger('click')

    expect(onClick.mock.calls[0]?.[1]).toBeUndefined()
  })

  it.each([
    ['paragraph', { type: 'reference', id: '741', raw: '[741]' }],
    [
      'nested inline node',
      {
        type: 'strong',
        raw: '**[741]**',
        children: [{ type: 'reference', id: '741', raw: '[741]' }],
      },
    ],
  ])('forwards the id from a custom reference renderer in a %s', async (_name, reference) => {
    const onClick = vi.fn()
    setCustomComponents('reference-click-test', {
      reference: defineComponent({
        props: ['node'],
        setup(props) {
          return () => h('button', { class: 'custom-reference' }, (props.node as any).id)
        },
      }),
    })
    const wrapper = mount(MarkdownRender, {
      props: {
        customId: 'reference-click-test',
        nodes: [paragraphWithReference(reference)] as any,
        onClick,
      },
    })
    await flushAll()

    await wrapper.get('.custom-reference').trigger('click')

    expect(onClick.mock.calls[0]?.[1]).toBe('741')
  })
})
