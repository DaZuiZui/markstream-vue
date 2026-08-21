import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function node(code: string) {
  return {
    type: 'code_block',
    language: 'infographic',
    code,
    raw: `\`\`\`infographic\n${code}\n\`\`\``,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react infographic streaming errors', () => {
  it('keeps the latest successful preview until a newer render succeeds or the stream finishes', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.spyOn(console, 'error').mockImplementation(() => {})

    class FakeInfographic {
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
    }

    vi.doMock('../packages/markstream-react/src/components/InfographicBlockNode/infographic', () => ({
      getInfographic: vi.fn(async () => FakeInfographic),
    }))

    const { InfographicBlockNode } = await import('../packages/markstream-react/src/components/InfographicBlockNode/InfographicBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const render = async (code: string, loading: boolean) => {
      await act(async () => {
        root.render(<InfographicBlockNode node={node(code) as any} loading={loading} showHeader={false} />)
      })
      await flushReact()
    }

    await render('first', true)
    await render('second', true)
    const secondPreview = host.querySelector('svg[data-preview="second"]')
    expect(secondPreview).not.toBeNull()

    await render('invalid intermediate', true)
    expect(host.querySelector('svg[data-preview="second"]')).toBe(secondPreview)
    expect(host.querySelector('[data-markstream-infographic]')?.getAttribute('data-markstream-mode')).toBe('preview')

    await render('invalid final', false)
    expect(host.textContent).toContain('Failed to render infographic: Incomplete streaming options')
    expect(host.querySelector('[data-markstream-infographic]')?.getAttribute('data-markstream-mode')).toBe('error')

    await act(async () => root.unmount())
  })
})
