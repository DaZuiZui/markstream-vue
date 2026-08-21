import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disableInfographic, setInfographicLoader } from '../src/components/InfographicBlockNode/infographic'
import InfographicBlockNode from '../src/components/InfographicBlockNode/InfographicBlockNode.vue'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'
import { flushAll } from './setup/flush-all'

function createNode(code: string) {
  return {
    type: 'code_block',
    language: 'infographic',
    code,
    raw: `\`\`\`infographic\n${code}\n\`\`\``,
  }
}

class ErrorInfographic {
  private errorHandler?: (error: unknown) => void

  on(event: string, handler: (error: unknown) => void) {
    if (event === 'error')
      this.errorHandler = handler
  }

  render() {
    this.errorHandler?.(new Error('Incomplete options'))
  }

  destroy() {}
}

class HeightChangingInfographic {
  container: HTMLElement

  constructor(options: { container: HTMLElement }) {
    this.container = options.container
  }

  render() {
    this.container.innerHTML = '<svg data-infographic="1" style="height: 900px"></svg>'
  }

  destroy() {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  disableInfographic()
})

describe('infographicBlockNode streaming errors', () => {
  it('disables preview mode when infographic loading is not configured', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: true,
      },
    })

    await flushAll()

    const previewButton = wrapper.findAll('button').find(btn => btn.text().includes('Preview'))
    expect(previewButton?.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('infographic list-row-simple-horizontal-arrow')

    wrapper.unmount()
  })

  it('only reports render errors after streaming completes', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    setInfographicLoader(() => ErrorInfographic)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: true,
      },
    })

    await flushAll()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Failed to render infographic')

    await wrapper.setProps({ loading: false })
    await flushAll()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Failed to render infographic: Incomplete options')

    wrapper.unmount()
  })

  it('keeps the last successful preview across intermediate failures and commits the final result', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const previousPreviewVisibleDuringFailure = vi.fn()
    let wrapper: ReturnType<typeof mount>

    class StatefulInfographic {
      private container: HTMLElement
      private errorHandler?: (error: unknown) => void

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      on(event: string, handler: (error: unknown) => void) {
        if (event === 'error')
          this.errorHandler = handler
      }

      render(source: string) {
        if (source.includes('invalid')) {
          previousPreviewVisibleDuringFailure(wrapper.find('svg[data-preview="second"]').exists())
          this.errorHandler?.(new Error('Incomplete streaming options'))
          return
        }
        const preview = source.includes('second') ? 'second' : 'first'
        this.container.innerHTML = `<svg data-preview="${preview}"></svg>`
      }

      destroy() {}
    }

    setInfographicLoader(() => StatefulInfographic)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('first'),
        loading: true,
      },
    })
    await flushAll()
    expect(wrapper.find('svg[data-preview="first"]').exists()).toBe(true)

    await wrapper.setProps({ node: createNode('second') })
    await flushAll()
    expect(wrapper.find('svg[data-preview="second"]').exists()).toBe(true)

    await wrapper.setProps({ node: createNode('invalid intermediate') })
    await flushAll()
    expect(previousPreviewVisibleDuringFailure).toHaveBeenLastCalledWith(true)
    expect(wrapper.attributes('data-markstream-mode')).toBe('preview')
    expect(wrapper.find('svg[data-preview="second"]').exists()).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: createNode('invalid final'),
      loading: false,
    })
    await flushAll()
    expect(wrapper.attributes('data-markstream-mode')).toBe('error')
    expect(wrapper.find('.infographic-preview svg').exists()).toBe(false)
    expect(wrapper.text()).toContain('Failed to render infographic: Incomplete streaming options')
    expect(errorSpy).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('does not report an in-flight streaming failure after loading settles', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveLoader: ((value: unknown) => void) | null = null
    const loaderPromise = new Promise<unknown>((resolve) => {
      resolveLoader = resolve
    })
    let renderCount = 0

    class StreamingRaceInfographic {
      private container: HTMLElement
      private errorHandler?: (error: unknown) => void

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      on(event: string, handler: (error: unknown) => void) {
        if (event === 'error')
          this.errorHandler = handler
      }

      render() {
        renderCount++
        if (renderCount === 1) {
          this.errorHandler?.(new Error('Incomplete streaming options'))
          return
        }
        this.container.innerHTML = '<svg data-infographic="final"></svg>'
      }

      destroy() {}
    }

    setInfographicLoader(() => loaderPromise)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: true,
      },
    })

    await flushAll()
    expect(renderCount).toBe(0)

    await wrapper.setProps({ loading: false })
    await flushAll()
    resolveLoader?.(StreamingRaceInfographic)
    await flushAll()

    expect(renderCount).toBe(2)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Failed to render infographic')
    expect(wrapper.find('svg[data-infographic="final"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('keeps the previous preview when a final render fails after streaming restarts', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    setInfographicLoader(() => HeightChangingInfographic)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: true,
      },
    })
    await flushAll()

    expect(wrapper.find('svg[data-infographic="1"]').exists()).toBe(true)

    let resolveLoader: ((value: unknown) => void) | null = null
    const loaderPromise = new Promise<unknown>((resolve) => {
      resolveLoader = resolve
    })
    setInfographicLoader(() => loaderPromise)
    await wrapper.setProps({
      node: createNode('infographic list-row-simple-horizontal-arrow next'),
      loading: false,
    })
    await flushAll()

    await wrapper.setProps({ loading: true })
    await flushAll()
    resolveLoader?.(ErrorInfographic)
    await flushAll()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Failed to render infographic')
    expect(wrapper.find('svg[data-infographic="1"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('does not report a stale final failure after the source changes', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveLoader: ((value: unknown) => void) | null = null
    const loaderPromise = new Promise<unknown>((resolve) => {
      resolveLoader = resolve
    })
    let renderCount = 0

    class SourceRaceInfographic {
      private container: HTMLElement
      private errorHandler?: (error: unknown) => void

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      on(event: string, handler: (error: unknown) => void) {
        if (event === 'error')
          this.errorHandler = handler
      }

      render(source: string) {
        renderCount++
        if (source === 'first') {
          this.errorHandler?.(new Error('Stale final source'))
          return
        }
        this.container.innerHTML = '<svg data-infographic="latest"></svg>'
      }

      destroy() {}
    }

    setInfographicLoader(() => loaderPromise)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('first'),
        loading: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ node: createNode('second') })
    await flushAll()
    resolveLoader?.(SourceRaceInfographic)
    await flushAll()

    expect(renderCount).toBe(1)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Failed to render infographic')
    expect(wrapper.find('svg[data-infographic="latest"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('keeps lifecycle pending across a queued rerender', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveLoader: ((value: unknown) => void) | null = null
    const loaderPromise = new Promise<unknown>((resolve) => {
      resolveLoader = resolve
    })

    class AsyncInfographic {
      container: HTMLElement

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      render(source: string) {
        this.container.innerHTML = `<svg data-source="${source}"></svg>`
      }

      destroy() {}
    }

    setInfographicLoader(() => loaderPromise)

    const markPending = vi.fn()
    const reportHeight = vi.fn()
    const markSettled = vi.fn()

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('first'),
        loading: true,
      },
      attrs: {
        'index-key': 'markdown-renderer-0',
      },
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: {
            markPending,
            reportHeight,
            markSettled,
          },
        },
      },
    })

    await flushAll()
    expect(markPending).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      node: createNode('second'),
    })
    await flushAll()

    resolveLoader?.(AsyncInfographic)
    await flushAll()

    expect(markPending).toHaveBeenCalledTimes(1)
    expect(markSettled).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('does not create an infographic instance when loading resolves after unmount', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveLoader: ((value: unknown) => void) | null = null
    const loaderStarted = vi.fn()
    const constructInstance = vi.fn()
    const renderInstance = vi.fn()
    const loaderPromise = new Promise<unknown>((resolve) => {
      resolveLoader = resolve
    })

    class AsyncInfographic {
      constructor() {
        constructInstance()
      }

      render() {
        renderInstance()
      }
    }

    setInfographicLoader(() => {
      loaderStarted()
      return loaderPromise
    })

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: false,
      },
    })

    await flushAll()
    expect(loaderStarted).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    resolveLoader?.(AsyncInfographic)
    await flushAll()

    expect(constructInstance).not.toHaveBeenCalled()
    expect(renderInstance).not.toHaveBeenCalled()
  })

  it('keeps an externally estimated preview height stable after render', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    setInfographicLoader(() => HeightChangingInfographic)

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: false,
        estimatedPreviewHeightPx: 360,
      },
    })

    await flushAll()

    const preview = wrapper.get('.infographic-preview').element as HTMLElement
    expect(preview.style.height).toBe('360px')

    wrapper.unmount()
  })
})
