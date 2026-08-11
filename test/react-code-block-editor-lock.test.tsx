import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeBlockNode } from '../packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode'

interface StreamMonacoHelpers {
  useMonaco: ReturnType<typeof vi.fn>
  createEditor: ReturnType<typeof vi.fn>
  createDiffEditor: ReturnType<typeof vi.fn>
  updateCode: ReturnType<typeof vi.fn>
  updateDiff: ReturnType<typeof vi.fn>
  getEditor: ReturnType<typeof vi.fn>
  getEditorView: ReturnType<typeof vi.fn>
  getDiffEditorView: ReturnType<typeof vi.fn>
  cleanupEditor: ReturnType<typeof vi.fn>
  safeClean: ReturnType<typeof vi.fn>
  refreshDiffPresentation: ReturnType<typeof vi.fn>
  setTheme: ReturnType<typeof vi.fn>
  whenVisualReady?: ReturnType<typeof vi.fn>
}

function getStreamMonacoHelpers(): StreamMonacoHelpers {
  return (globalThis as any).__streamMonacoHelpers
}

function resetStreamMonacoHelpers() {
  const helpers = getStreamMonacoHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 14,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })

  helpers.useMonaco.mockReset().mockImplementation(() => helpers)
  helpers.createEditor.mockReset().mockImplementation(async () => {})
  helpers.createDiffEditor.mockReset().mockImplementation(async () => {})
  helpers.updateCode.mockReset()
  helpers.updateDiff.mockReset()
  helpers.getEditor.mockReset().mockImplementation(() => null)
  helpers.getEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.getDiffEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.cleanupEditor.mockReset().mockImplementation(() => {})
  helpers.safeClean.mockReset().mockImplementation(() => {})
  helpers.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  helpers.setTheme.mockReset().mockImplementation(async () => {})
  delete helpers.whenVisualReady
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  })
}

async function waitForCallCount(fn: ReturnType<typeof vi.fn>, expected: number, timeout = 1000) {
  const start = Date.now()
  while (fn.mock.calls.length < expected) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for mock call')
    await flushReact()
  }
}

async function waitForEditorVisible(getEditorHost: () => HTMLElement | null, timeout = 1000) {
  const start = Date.now()
  while (getEditorHost()?.style.visibility !== 'visible') {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for the editor handoff')
    await flushReact()
  }
}

function setElementRect(element: Element, rect: { top: number, bottom: number, height: number, width?: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: rect.top,
      top: rect.top,
      bottom: rect.bottom,
      left: 0,
      right: rect.width ?? 1000,
      width: rect.width ?? 1000,
      height: rect.height,
      toJSON: () => ({}),
    }) as DOMRect,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react codeBlockNode theme updates', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  it('updates single-editor themes without recreating the editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const baseProps = {
      node: {
        type: 'code_block',
        language: 'json',
        code: '{"hello":"world"}',
        raw: '```json\n{"hello":"world"}\n```',
      },
      loading: false,
      showHeader: false,
      isDark: false,
      darkTheme: 'vitesse-dark',
      lightTheme: 'vitesse-light',
    }

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, baseProps))
    })
    await waitForCallCount(helpers.createEditor, 1)
    await flushReact()

    helpers.createEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.setTheme.mockClear()

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        ...baseProps,
        isDark: true,
      }))
    })
    await flushReact()

    expect(helpers.createEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')

    await act(async () => {
      root.unmount()
    })
  })

  it('updates diff themes without recreating the diff editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const baseProps = {
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: 'const a = 1\nconst b = 2\n',
        updatedCode: 'const a = 1\nconst c = 3\n',
        raw: '```diff\n-const b = 2\n+const c = 3\n```',
      },
      loading: false,
      showHeader: false,
      isDark: false,
      darkTheme: 'vitesse-dark',
      lightTheme: 'vitesse-light',
    }

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, baseProps))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)
    await flushReact()

    helpers.createDiffEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.refreshDiffPresentation.mockClear()
    helpers.setTheme.mockClear()

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        ...baseProps,
        isDark: true,
      }))
    })
    await flushReact()

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')
    expect(helpers.refreshDiffPresentation).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('applies the neutral stream-diffs defaults', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\nconst b = 2\n',
          updatedCode: 'const a = 1\nconst c = 3\n',
          raw: '```diff\n-const b = 2\n+const c = 3\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      }))
    })
    await waitForCallCount(helpers.useMonaco, 1)

    const options = helpers.useMonaco.mock.calls[0]?.[0] as Record<string, any> | undefined

    expect(options?.diffStyle).toBe('split')
    expect(options?.expandUnchanged).toBe(false)
    expect(options?.collapsedContextThreshold).toBe(5)
    expect(options?.hunkSeparators).toBe('line-info')
    expect(options?.parseDiffOptions).toEqual({ context: 2 })
    expect(options?.stream).toBe(false)
    expect(options?.disableFileHeader).toBe(true)
    expect(options?.disableLineNumbers).toBe(false)
    expect(options?.fontSize).toBe(12)
    expect(options?.lineHeight).toBe(18)
    expect(options?.padding).toBeUndefined()

    await act(async () => {
      root.unmount()
    })
  })

  it('merges codeBlockOptions before host-owned runtime fields', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onLineClick = vi.fn()
    const consumerThemeChange = vi.fn()

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\n',
          updatedCode: 'const a = 2\n',
          raw: '```diff\n-const a = 1\n+const a = 2\n```',
        },
        loading: false,
        showHeader: false,
        showLineNumbers: false,
        isDark: true,
        darkTheme: 'github-dark',
        lightTheme: 'github-light',
        themes: ['github-dark', 'github-light'],
        codeBlockOptions: {
          maxHeight: 420,
          padding: 4,
          tabSize: 8,
          fontSize: 16,
          lineHeight: 24,
          fontFamily: 'Fira Code',
          diffStyle: 'unified',
          diffIndicators: 'bars',
          parseDiffOptions: { context: 7, ignoreWhitespace: true },
          enableLineSelection: true,
          onLineClick,
          unsafeCSS: '.consumer-rule { color: red; }',
          theme: 'consumer-theme',
          themeType: 'consumer',
          themes: ['consumer-dark', 'consumer-light'],
          language: 'consumer-language',
          languages: ['consumer-language'],
          stream: true,
          disableFileHeader: false,
          onThemeChange: consumerThemeChange,
        },
      }))
    })
    await waitForCallCount(helpers.useMonaco, 1)
    await waitForCallCount(helpers.createDiffEditor, 1)
    await flushReact()

    const options = helpers.useMonaco.mock.calls[0]?.[0] as Record<string, any>
    expect(options).toMatchObject({
      MAX_HEIGHT: 420,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: 'Fira Code',
      diffStyle: 'unified',
      diffIndicators: 'bars',
      enableLineSelection: true,
      stream: false,
      disableFileHeader: true,
      disableLineNumbers: true,
      theme: 'github-dark',
      themeType: 'dark',
      themes: ['github-dark', 'github-light'],
    })
    expect(options.parseDiffOptions).toEqual({ context: 7, ignoreWhitespace: true })
    expect(options.onLineClick).toBe(onLineClick)
    expect(options.onThemeChange).not.toBe(consumerThemeChange)
    expect(options.language).toBeUndefined()
    expect(options.languages).toBeUndefined()
    expect(options.unsafeCSS).toContain('[data-file], [data-diff]')
    expect(options.unsafeCSS).toContain('.consumer-rule { color: red; }')
    expect(options.maxHeight).toBeUndefined()
    expect(options.padding).toBeUndefined()
    expect(options.tabSize).toBeUndefined()

    const editorHost = host.querySelector('.code-editor-container') as HTMLElement | null
    const fallback = host.querySelector('pre.code-fallback-plain') as HTMLElement | null
    expect(editorHost?.style.maxHeight).toBe('420px')
    expect(editorHost?.style.getPropertyValue('--diffs-tab-size')).toBe('8')
    expect(editorHost?.style.getPropertyValue('--diffs-gap-block')).toBe('4px')
    expect(fallback?.style.fontSize).toBe('16px')
    expect(fallback?.style.lineHeight).toBe('24px')
    expect(fallback?.style.paddingTop).toBe('4px')
    expect(fallback?.style.paddingBottom).toBe('4px')
    expect(fallback?.style.tabSize).toBe('8')
    expect(fallback?.style.maxHeight).toBe('420px')
    expect(fallback?.style.overflow).toBe('auto')

    await act(async () => {
      root.unmount()
    })
  })

  it('selects a tuple-only theme by host color mode', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        isDark: false,
        loading: false,
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
        showHeader: false,
        themes: ['tuple-dark', 'tuple-light'],
      }))
    })
    await waitForCallCount(helpers.useMonaco, 1)
    expect(helpers.useMonaco.mock.calls[0]?.[0]?.theme).toBe('tuple-light')

    await act(async () => {
      root.unmount()
    })
  })

  it('recreates the runtime when codeBlockOptions identity changes', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = {
      type: 'code_block',
      language: 'ts',
      code: 'const value = 1',
      raw: '```ts\nconst value = 1\n```',
    }
    const firstOnLineClick = vi.fn()
    const secondOnLineClick = vi.fn()

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node,
        loading: false,
        showHeader: false,
        codeBlockOptions: {
          overflow: 'scroll',
          onLineClick: firstOnLineClick,
        },
      }))
    })
    await waitForCallCount(helpers.useMonaco, 1)
    await waitForCallCount(helpers.createEditor, 1)

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node,
        loading: false,
        showHeader: false,
        codeBlockOptions: {
          overflow: 'wrap',
          onLineClick: secondOnLineClick,
        },
      }))
    })
    await waitForCallCount(helpers.useMonaco, 2)

    const options = helpers.useMonaco.mock.calls[1]?.[0] as Record<string, any>
    expect(options.overflow).toBe('wrap')
    expect(options.onLineClick).toBe(secondOnLineClick)
    expect(helpers.safeClean).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('recreates the runtime when direct line-number precedence changes', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = {
      type: 'code_block',
      language: 'ts',
      code: 'const value = 1',
      raw: '```ts\nconst value = 1\n```',
    }
    const codeBlockOptions = { disableLineNumbers: true }

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        codeBlockOptions,
        loading: false,
        node,
        showHeader: false,
        showLineNumbers: true,
      }))
    })
    await waitForCallCount(helpers.useMonaco, 1)
    expect(helpers.useMonaco.mock.calls[0]?.[0]?.disableLineNumbers).toBe(false)

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        codeBlockOptions,
        loading: false,
        node,
        showHeader: false,
        showLineNumbers: false,
      }))
    })
    await waitForCallCount(helpers.useMonaco, 2)
    expect(helpers.useMonaco.mock.calls[1]?.[0]?.disableLineNumbers).toBe(true)

    await act(async () => {
      root.unmount()
    })
  })

  it('resyncs diff height after a diff update settles', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let editorHost: HTMLElement | null = null
    let updateDiffListener: (() => void) | null = null

    const diffView = {
      getContentHeight: vi.fn(() => 300),
      updateOptions: vi.fn(),
      layout: vi.fn(),
      onDidUpdateDiff: vi.fn((callback: () => void) => {
        updateDiffListener = callback
        return { dispose: vi.fn() }
      }),
      getOriginalEditor: vi.fn(() => ({
        onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
      })),
      getModifiedEditor: vi.fn(() => ({
        onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
      })),
    }
    helpers.getDiffEditorView.mockReturnValue(diffView)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      editorHost = el
      setElementRect(el, { top: 0, bottom: 500, height: 500 })
      const shell = document.createElement('div')
      shell.className = 'stream-diffs-shell'
      setElementRect(shell, { top: 0, bottom: 300, height: 300 })
      el.appendChild(shell)
    })

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "version": "0.0.54-beta.1"\n}',
          diff: true,
          originalCode: '{\n  "version": "0.0.49"\n}',
          updatedCode: '{\n  "version": "0.0.54-beta.1"\n}',
          raw: '```diff / json:package.json\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
      }))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)
    await waitForEditorVisible(() => editorHost)

    // Content height (300) is below the max (500); the host should reflect it.
    await act(async () => {
      updateDiffListener?.()
      await Promise.resolve()
    })
    await flushReact()

    const syncedHeight = Number.parseInt(editorHost?.style.height || '0', 10)
    expect(syncedHeight).toBeGreaterThanOrEqual(286)
    expect(syncedHeight).toBeLessThan(500)

    await act(async () => {
      root.unmount()
    })
  })

  it('renders a two-pane diff fallback with stream-diffs-aligned metrics before the diff editor is ready', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let resolveCreateDiffEditor: (() => void) | undefined

    helpers.createDiffEditor.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCreateDiffEditor = resolve
    }))

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          diff: true,
          originalCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.49"\n}',
          updatedCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          raw: '```diff / json:package.json\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
      }))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)

    const fallback = host.querySelector('pre.code-fallback-plain.markstream-pre--diff-preview') as HTMLElement | null
    expect(fallback).not.toBeNull()
    expect(fallback?.dataset.language).toBe('json')
    expect(fallback?.style.fontSize).toBe('12px')
    expect(fallback?.style.lineHeight).toBe('18px')
    expect(fallback?.style.paddingTop).toBe('0px')
    expect(fallback?.style.paddingBottom).toBe('0px')
    expect(fallback?.style.tabSize).toBe('4')

    const panes = host.querySelectorAll('.markstream-pre__diff-pane')
    expect(panes).toHaveLength(2)
    expect(host.querySelector('.markstream-pre__diff-pane--original')?.textContent).toContain('"version": "0.0.49"')
    expect(host.querySelector('.markstream-pre__diff-pane--modified')?.textContent).toContain('"version": "0.0.54-beta.1"')
    expect(host.querySelector('.markstream-pre__diff-pane--original .markstream-pre__diff-line--removed')?.textContent).toContain('"version": "0.0.49"')
    expect(host.querySelector('.markstream-pre__diff-pane--modified .markstream-pre__diff-line--added')?.textContent).toContain('"version": "0.0.54-beta.1"')

    await act(async () => {
      resolveCreateDiffEditor?.()
    })
    await flushReact()

    await act(async () => {
      root.unmount()
    })
  })

  it('reveals a partial diff after a queued update produces a visible surface', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let editorHost: HTMLElement | null = null
    let shell: HTMLElement | null = null

    helpers.whenVisualReady = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    helpers.createDiffEditor.mockImplementation(async (element: HTMLElement) => {
      editorHost = element
      shell = document.createElement('div')
      shell.className = 'stream-diffs-shell'
      element.appendChild(shell)
    })
    helpers.updateDiff.mockImplementation(async () => {
      if (!shell)
        return
      setElementRect(shell, { top: 0, bottom: 200, height: 200 })
      const pre = document.createElement('pre')
      pre.dataset.diff = ''
      pre.textContent = '- "version": "1.0.0"\n+ "version": "2.0.0"'
      shell.appendChild(pre)
    })

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'json',
          code: '{',
          diff: true,
          originalCode: '{',
          updatedCode: '{',
          raw: '```diff json\n{\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      }))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)
    await waitForCallCount(helpers.updateDiff, 1)
    await waitForEditorVisible(() => editorHost)

    expect(helpers.whenVisualReady.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(shell?.getBoundingClientRect().height).toBe(200)
    expect(shell?.querySelector('pre[data-diff]')?.textContent).toContain('"version": "2.0.0"')
    expect(editorHost?.dataset.markstreamEnhanced).toBe('true')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })
})

describe('markstream-react codeBlockNode plain text theme fallback', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  it('keeps dark plain text blocks on the fallback dark surface when Monaco reports light colors', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    helpers.createEditor.mockImplementation(async (el: HTMLElement) => {
      const editor = document.createElement('div')
      editor.className = 'monaco-editor'
      editor.style.backgroundColor = 'rgb(255, 255, 255)'
      editor.style.color = 'rgb(17, 24, 39)'

      const background = document.createElement('div')
      background.className = 'monaco-editor-background'
      background.style.backgroundColor = 'rgb(255, 255, 255)'

      const lines = document.createElement('div')
      lines.className = 'view-lines'
      lines.style.color = 'rgb(17, 24, 39)'

      editor.append(background, lines)
      el.appendChild(editor)
    })

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'plaintext',
          code: 'packages/',
          raw: '```text\npackages/\n```',
        },
        loading: false,
        isDark: true,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      }))
    })
    await waitForCallCount(helpers.createEditor, 1)
    await flushReact()

    const container = host.querySelector('.code-block-container') as HTMLElement | null
    expect(container?.classList.contains('is-dark')).toBe(true)
    expect(container?.classList.contains('is-plain-text')).toBe(true)
    expect(container?.style.getPropertyValue('--vscode-editor-background')).toBe('')
    expect(container?.style.getPropertyValue('--vscode-editor-foreground')).toBe('')

    await act(async () => {
      root.unmount()
    })
  })
})
