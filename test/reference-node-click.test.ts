/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MarkdownRender from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

function paragraphWithReference(reference: Record<string, unknown>) {
  return {
    type: 'paragraph',
    raw: '[741]',
    children: [reference],
  }
}

describe('reference node click', () => {
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
})
