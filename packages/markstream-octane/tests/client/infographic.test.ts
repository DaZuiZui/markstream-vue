import { cleanup, render, waitFor } from '@octanejs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InfographicBlockNode } from '../../src/components/InfographicBlockNode/InfographicBlockNode.tsrx'

const mockState = vi.hoisted(() => ({ sources: [] as string[] }))

vi.mock('../../src/components/InfographicBlockNode/infographic', () => ({
  getInfographic: vi.fn(async () => class FakeInfographic {
    private container: HTMLElement
    private errorHandler?: (error: unknown) => void
    private renderedHandler?: () => void

    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    on(event: string, handler: (payload?: unknown) => void) {
      if (event === 'error')
        this.errorHandler = handler
      if (event === 'rendered')
        this.renderedHandler = handler
    }

    render(source: string) {
      mockState.sources.push(source)
      if (source.includes('invalid')) {
        this.container.replaceChildren(document.createTextNode('partial'))
        this.errorHandler?.(new Error('Incomplete streaming options'))
        return
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('data-preview', source)
      this.container.replaceChildren(svg)
      this.renderedHandler?.()
    }

    destroy() {}
  }),
}))

function node(code: string) {
  return {
    type: 'code_block' as const,
    language: 'infographic',
    code,
    raw: `\`\`\`infographic\n${code}\n\`\`\``,
  }
}

afterEach(() => {
  cleanup()
  mockState.sources = []
  document.body.innerHTML = ''
})

describe('markstream-octane infographic streaming errors', () => {
  it('keeps the latest successful preview until a newer render succeeds or the stream finishes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = render(InfographicBlockNode, {
      props: { node: node('first'), loading: true, showHeader: false },
    })
    await waitFor(() => expect(mockState.sources).toContain('first'))

    view.rerender({
      props: { node: node('second'), loading: true, showHeader: false },
    })
    await waitFor(() => expect(mockState.sources).toContain('second'))
    const secondPreview = view.container.querySelector('svg[data-preview="second"]')
    expect(secondPreview).not.toBeNull()

    view.rerender({
      props: { node: node('invalid intermediate'), loading: true, showHeader: false },
    })
    await waitFor(() => expect(mockState.sources).toContain('invalid intermediate'))
    expect(view.container.querySelector('svg[data-preview="second"]')).toBe(secondPreview)
    expect(view.container.querySelector('[data-markstream-infographic]')?.getAttribute('data-markstream-mode')).toBe('preview')

    view.rerender({
      props: { node: node('invalid final'), loading: false, showHeader: false },
    })
    await waitFor(() => expect(view.container.textContent).toContain('Failed to render infographic: Incomplete streaming options'))
    expect(view.container.querySelector('[data-markstream-infographic]')?.getAttribute('data-markstream-mode')).toBe('error')
  })
})
