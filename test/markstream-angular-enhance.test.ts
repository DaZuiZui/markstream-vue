import { describe, expect, it, vi } from 'vitest'
import { enhanceRenderedHtml } from '../packages/markstream-angular/src/enhanceRenderedHtml'

const {
  runtimeCleanup,
  runtimeCreateDiffEditor,
  runtimeCreateEditor,
  runtimeSetTheme,
  codeBlockRuntimeOptions,
  canParseOffthread,
  findPrefixOffthread,
  mermaidState,
} = vi.hoisted(() => ({
  runtimeCleanup: vi.fn(),
  runtimeCreateEditor: vi.fn(async (container: HTMLElement, code: string, language: string) => {
    container.innerHTML = `<div data-stream-diffs="1" data-language="${language}">${code}</div>`
  }),
  runtimeCreateDiffEditor: vi.fn(async (container: HTMLElement, original: string, modified: string, language: string) => {
    container.innerHTML = `<div data-stream-diffs-diff="1" data-language="${language}" data-original="${original}" data-modified="${modified}"></div>`
  }),
  runtimeSetTheme: vi.fn(async () => {}),
  codeBlockRuntimeOptions: [] as Array<Record<string, unknown>>,
  canParseOffthread: vi.fn(async () => true),
  findPrefixOffthread: vi.fn(async () => null),
  mermaidState: { failOnBToC: false },
}))

vi.mock('../packages/markstream-angular/src/optional/katex', () => ({
  isKatexEnabled: vi.fn(() => true),
  getKatex: vi.fn(async () => ({
    renderToString(source: string, options?: { displayMode?: boolean }) {
      return options?.displayMode
        ? `<span class="katex-display">${source}</span>`
        : `<span class="katex">${source}</span>`
    },
  })),
}))

vi.mock('../packages/markstream-angular/src/optional/mermaid', () => ({
  isMermaidEnabled: vi.fn(() => true),
  getMermaid: vi.fn(async () => ({
    render: vi.fn(async (_id: string, source: string) => {
      if (mermaidState.failOnBToC && source.includes('B-->C'))
        throw new Error('Incomplete mermaid graph')
      return {
        svg: `<svg data-mermaid="1"><text>${source}</text></svg>`,
      }
    }),
  })),
}))

vi.mock('../packages/markstream-angular/src/workers/mermaidWorkerClient', () => ({
  canParseOffthread,
  findPrefixOffthread,
}))

vi.mock('../packages/markstream-angular/src/optional/d2', () => ({
  getD2: vi.fn(async () => class MockD2 {
    async compile(code: string) {
      return { diagram: { code }, renderOptions: {} }
    }

    async render(diagram: { code: string }) {
      return {
        svg: `<svg data-d2="1"><text>${diagram.code}</text></svg>`,
      }
    }
  }),
}))

vi.mock('../packages/markstream-angular/src/optional/infographic', () => ({
  getInfographic: vi.fn(async () => class MockInfographic {
    container: HTMLElement

    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    render(source: string) {
      this.container.innerHTML = `<svg data-infographic="1"><text>${source}</text></svg>`
    }

    destroy() {
      this.container.dataset.infographicDestroyed = '1'
    }
  }),
}))

vi.mock('../packages/markstream-angular/src/optional/streamDiffs', () => ({
  getStreamDiffsRuntime: vi.fn(async () => ({
    createCodeBlockRuntime: vi.fn((options: Record<string, unknown>) => {
      codeBlockRuntimeOptions.push(options)
      return {
        createEditor: runtimeCreateEditor,
        createDiffEditor: runtimeCreateDiffEditor,
        setTheme: runtimeSetTheme,
        cleanupEditor: runtimeCleanup,
      }
    }),
  })),
}))

describe('markstream-angular enhanceRenderedHtml', () => {
  it('hydrates math, mermaid, stream-diffs, infographic, and d2 blocks in place', async () => {
    runtimeCleanup.mockReset()
    runtimeCreateEditor.mockClear()
    runtimeCreateDiffEditor.mockClear()
    runtimeSetTheme.mockClear()
    codeBlockRuntimeOptions.length = 0
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const onCopy = vi.fn()
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">E = mc^2</span><span class="markstream-nested-math__render"></span></span>
        <div class="markstream-nested-math-block"><pre class="markstream-nested-math-block__source"><code>\\int_0^1 x^2 dx</code></pre><div class="markstream-nested-math-block__render"></div></div>
        <pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph TD; A-->B;</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="json:package.json" data-markstream-diff="1" data-markstream-original="eyJ2ZXJzaW9uIjoiMC4wLjQ5In0=" data-markstream-updated="eyJ2ZXJzaW9uIjoiMC4wLjU0LWJldGEuMSJ9" style="margin: 2px 0; padding: 12px 14px;"><code class="language-json" style="font-size: 15px; line-height: 24px; font-family: Menlo;">-{"version":"0.0.49"}
+{"version":"0.0.54-beta.1"}</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="infographic"><code class="language-infographic">infographic list-row-simple-horizontal-arrow</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    const handle = await enhanceRenderedHtml(shell, {
      final: true,
      isDark: true,
      onCopy,
      showTooltips: true,
    })

    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('class="katex-display"')
    expect(shell.innerHTML).toContain('data-mermaid="1"')
    expect(shell.innerHTML).toContain('markstream-angular-mermaid')
    expect(shell.innerHTML).toContain('data-stream-diffs="1"')
    expect(shell.innerHTML).toContain('data-stream-diffs-diff="1"')
    expect(shell.innerHTML).toContain('data-markstream-enhanced-diff="1"')
    expect(shell.innerHTML).toContain('data-infographic="1"')
    expect(shell.innerHTML).toContain('data-d2="1"')
    expect(shell.innerHTML).toContain('markstream-angular-enhanced-block__action')
    expect(runtimeCreateDiffEditor).toHaveBeenCalledWith(expect.any(HTMLElement), '{"version":"0.0.49"}', '{"version":"0.0.54-beta.1"}', 'json')
    expect(codeBlockRuntimeOptions[0]).toMatchObject({
      disableFileHeader: true,
    })
    expect(codeBlockRuntimeOptions[0]?.unsafeCSS).toContain('--diffs-min-number-column-width-default: 2ch !important')
    expect(codeBlockRuntimeOptions[1]).toMatchObject({
      fontSize: 15,
      lineHeight: 24,
      fontFamily: 'Menlo',
      disableFileHeader: true,
    })
    expect(codeBlockRuntimeOptions[1]?.padding).toBeUndefined()
    expect(shell.querySelectorAll<HTMLElement>('.markstream-angular-enhanced-block__body--code')[1]?.style.getPropertyValue('--diffs-gap-block')).toBe('12px')

    const copyButton = shell.querySelector<HTMLButtonElement>('.markstream-angular-enhanced-block__action')
    copyButton?.click()
    expect(onCopy).toHaveBeenCalled()

    handle.dispose()
    expect(runtimeCleanup).toHaveBeenCalledTimes(2)
  })

  it('cleans up and restores the pre fallback when enhancement is cancelled during editor creation', async () => {
    runtimeCleanup.mockClear()
    let cancelled = false
    runtimeCreateEditor.mockImplementationOnce(async (container: HTMLElement, code: string, language: string) => {
      container.innerHTML = `<div data-stream-diffs="1" data-language="${language}">${code}</div>`
      cancelled = true
    })
    const root = document.createElement('div')
    root.innerHTML = '<pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>'

    await enhanceRenderedHtml(root, {
      codeBlockOptions: { overflow: 'scroll' },
      final: true,
      isCancelled: () => cancelled,
    })

    expect(runtimeCleanup).toHaveBeenCalledTimes(1)
    expect(root.querySelector('.markstream-angular-enhanced-block')).toBeNull()
    const fallback = root.querySelector('pre[data-markstream-code-block="1"]') as HTMLElement | null
    expect(fallback?.textContent).toContain('const value = 1')
    expect(fallback?.style.whiteSpace).toBe('pre')
  })

  it('uses component theme precedence in the static code enhancer', async () => {
    runtimeCleanup.mockClear()
    runtimeCreateEditor.mockClear()
    runtimeSetTheme.mockClear()
    codeBlockRuntimeOptions.length = 0
    const root = document.createElement('div')
    const source = Array.from({ length: 20 }, (_, index) => `const value${index} = ${index}`).join('\n')
    root.innerHTML = `<pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">${source}</code></pre>`

    const handle = await enhanceRenderedHtml(root, {
      codeBlockOptions: { maxHeight: 123 },
      codeBlockProps: {
        theme: { dark: 'pair-dark', light: 'pair-light' },
        themes: ['tuple-dark', 'tuple-light'],
      },
      codeBlockDarkTheme: 'top-dark',
      codeBlockLightTheme: 'top-light',
      final: true,
      isDark: true,
      themes: ['top-tuple-dark', 'top-tuple-light'],
    })

    expect(codeBlockRuntimeOptions[0]).toMatchObject({
      theme: 'pair-dark',
      themes: ['tuple-dark', 'tuple-light'],
    })
    expect(runtimeSetTheme).toHaveBeenCalledWith('pair-dark')
    const enhancedBody = root.querySelector<HTMLElement>('.markstream-angular-enhanced-block__body--code')
    expect(enhancedBody?.style.maxHeight).toBe('123px')
    expect(enhancedBody?.style.minHeight).toBe('123px')
    expect(enhancedBody?.style.overflow).toBe('auto')
    handle.dispose()
    const fallback = root.querySelector('pre') as HTMLElement | null
    expect(fallback?.style.maxHeight).toBe('123px')
    expect(fallback?.style.overflow).toBe('auto')

    codeBlockRuntimeOptions.length = 0
    runtimeSetTheme.mockClear()
    const tupleRoot = document.createElement('div')
    tupleRoot.innerHTML = '<pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const tuple = true</code></pre>'
    const tupleHandle = await enhanceRenderedHtml(tupleRoot, {
      final: true,
      isDark: false,
      themes: ['tuple-dark', 'tuple-light'],
    })
    expect(codeBlockRuntimeOptions[0]?.theme).toBe('tuple-light')
    expect(runtimeSetTheme).toHaveBeenCalledWith('tuple-light')
    tupleHandle.dispose()
  })

  it('cleans up and restores the pre fallback when cancelled during theme application', async () => {
    runtimeCleanup.mockClear()
    runtimeCreateEditor.mockClear()
    runtimeSetTheme.mockClear()
    let cancelled = false
    let resolveTheme!: () => void
    runtimeSetTheme.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveTheme = resolve
    }))
    const root = document.createElement('div')
    root.innerHTML = '<pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>'

    const enhancement = enhanceRenderedHtml(root, {
      final: true,
      isCancelled: () => cancelled,
    })
    await vi.waitFor(() => expect(runtimeSetTheme).toHaveBeenCalledTimes(1))
    cancelled = true
    resolveTheme()
    await enhancement

    expect(runtimeCleanup).toHaveBeenCalledTimes(1)
    expect(root.querySelector('.markstream-angular-enhanced-block')).toBeNull()
    expect(root.querySelector('pre[data-markstream-code-block="1"]')?.textContent).toContain('const value = 1')
  })

  it('skips heavy code/diagram upgrades while content is still streaming', async () => {
    runtimeCleanup.mockReset()
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">a+b</span><span class="markstream-nested-math__render"></span></span>
        <pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('language-ts')
    expect(shell.innerHTML).not.toContain('data-stream-diffs="1"')
    expect(shell.innerHTML).not.toContain('data-d2="1"')
    expect(runtimeCleanup).not.toHaveBeenCalled()
  })

  it('does not re-render KaTeX from already-rendered output', async () => {
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">x = a</span><span class="markstream-nested-math__render"></span></span>
        <div class="markstream-nested-math-block"><pre class="markstream-nested-math-block__source"><code>f(x) = x^2</code></pre><div class="markstream-nested-math-block__render"></div></div>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })
    const firstPass = shell.innerHTML

    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toBe(firstPass)
    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('class="katex-display"')
  })

  it('re-renders KaTeX when the source text changes during streaming', async () => {
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">x = a</span><span class="markstream-nested-math__render"></span></span>
        <div class="markstream-nested-math-block"><pre class="markstream-nested-math-block__source"><code>f(x) = x^2</code></pre><div class="markstream-nested-math-block__render"></div></div>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('x = a')
    expect(shell.innerHTML).toContain('f(x) = x^2')

    const inlineSource = shell.querySelector('.markstream-nested-math__source')
    const blockSource = shell.querySelector('.markstream-nested-math-block__source code')
    inlineSource!.textContent = 'x = a + b'
    blockSource!.textContent = 'f(x) = x^3'

    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('x = a + b')
    expect(shell.innerHTML).toContain('f(x) = x^3')
    expect(shell.querySelector('.markstream-nested-math')?.getAttribute('data-markstream-katex-source')).toBe('x = a + b')
    expect(shell.querySelector('.markstream-nested-math-block')?.getAttribute('data-markstream-katex-source')).toBe('f(x) = x^3')
  })

  it('renders a mermaid prefix preview while streaming when the full diagram is not yet valid', async () => {
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async (source: string) => !source.includes('B-->C'))
    findPrefixOffthread.mockImplementation(async () => 'graph LR\nA-->B\n')
    mermaidState.failOnBToC = true

    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph LR
A-->B
B-->C
</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(canParseOffthread).toHaveBeenCalled()
    expect(findPrefixOffthread).toHaveBeenCalled()
    expect(shell.innerHTML).toContain('data-mermaid="1"')
    expect(shell.innerHTML).toContain('markstream-angular-mermaid')
    const previewHost = shell.querySelector('.markstream-angular-mermaid')
    expect(previewHost?.innerHTML).toContain('A--&gt;B')
    expect(previewHost?.innerHTML).not.toContain('B--&gt;C')

    mermaidState.failOnBToC = false
  })
})
