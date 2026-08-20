import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushAll } from './setup/flush-all'

afterEach(() => {
  vi.doUnmock('../src/components/InfographicBlockNode')
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('infographic async loading fallback', () => {
  it('keeps the Infographic shell when the component chunk fails to load', async () => {
    vi.doMock('../src/components/InfographicBlockNode', () => {
      throw new Error('chunk failed')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const MarkdownRender = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(MarkdownRender, {
      props: {
        content: `\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label: Step 1
      desc: Start
\`\`\``,
        final: true,
        batchRendering: false,
        viewportPriority: false,
      },
    })

    await flushAll()

    const fallback = wrapper.get('[data-markstream-infographic="1"]')
    expect(fallback.attributes('data-markstream-mode')).toBe('pending')
    expect(fallback.get('.infographic-block-header').text()).toContain('Infographic')
    expect(fallback.get('.infographic-pending-source').text()).toContain('list-row-simple-horizontal-arrow')

    wrapper.unmount()
  })
})
