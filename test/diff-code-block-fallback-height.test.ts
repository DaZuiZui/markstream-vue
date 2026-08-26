import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'

function getStreamDiffsHelpers() {
  return (globalThis as any).__streamDiffsHelpers
}

function resetHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const helpers = getStreamDiffsHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 18,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })
  helpers.createCodeBlockRuntime.mockReset().mockImplementation(() => helpers)
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
}

async function flushPendingMicrotasks() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function')
      globalThis.requestAnimationFrame(() => resolve())
    else
      setTimeout(resolve, 0)
  })
}

describe('diff CodeBlockNode fallback height stability', () => {
  beforeEach(() => {
    resetHelpers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not create an editor host observer while a diff is streaming', async () => {
    const observations: Array<{ options: MutationObserverInit, target: Node }> = []
    vi.stubGlobal('MutationObserver', class {
      constructor(_callback: MutationCallback) {}

      observe(target: Node, options: MutationObserverInit) {
        observations.push({ options, target })
      }

      disconnect() {}
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const hostObservation = observations.find(({ target }) =>
      (target as HTMLElement).classList?.contains('code-editor-container'),
    )
    expect(hostObservation).toBeUndefined()

    wrapper.unmount()
  })

  it('ignores a restored height estimate while a plain block is streaming', async () => {
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const first = true\nconst second = false',
          raw: '```ts\nconst first = true\nconst second = false',
          loading: true,
        },
        estimatedContentHeightPx: 1000,
        estimatedHeightPx: 1042,
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    const host = wrapper.get('.code-editor-container').element as HTMLElement
    const block = wrapper.get('[data-markstream-code-block="1"]').element as HTMLElement
    expect(pre.style.minHeight).toBe('37px')
    expect(host.style.minHeight).toBe('37px')
    expect(block.style.minHeight).toBe('79px')
    expect(pre.style.minHeight).not.toBe('500px')
    expect(host.style.minHeight).not.toBe('500px')
    expect(block.style.minHeight).not.toBe('1042px')

    wrapper.unmount()
  })

  it('clears an armed restored height floor when a plain block starts streaming again', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createEditor.mockImplementation(() => new Promise<void>(() => {}))
    const settledNode = {
      type: 'code_block' as const,
      language: 'ts',
      code: 'const first = true\nconst second = false',
      raw: '```ts\nconst first = true\nconst second = false\n```',
      loading: false,
    }
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: settledNode,
        estimatedContentHeightPx: 1000,
        estimatedHeightPx: 1042,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await vi.waitFor(() => expect(helpers.createEditor).toHaveBeenCalledTimes(1))
    const host = wrapper.get('.code-editor-container').element as HTMLElement
    expect(host.style.minHeight).toBe('500px')

    await wrapper.setProps({
      node: { ...settledNode, loading: true },
      loading: true,
    })
    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    const block = wrapper.get('[data-markstream-code-block="1"]').element as HTMLElement
    expect(pre.style.minHeight).toBe('37px')
    expect(host.style.minHeight).toBe('37px')
    expect(block.style.minHeight).toBe('79px')

    wrapper.unmount()
  })

  it('keeps diff fallback height owned by its rendered rows when an estimate is set', async () => {
    const helpers = getStreamDiffsHelpers()
    // Hold createDiffEditor so the enhanced surface is never ready during this test.
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const originalCode = 'const a = 1\nconst b = 2\nconst c = 3\n'
    const updatedCode = 'const a = 1\nconst b = 99\nconst c = 3\n'

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode,
          updatedCode,
        },
        // Simulate virtual scroll passing an estimated height
        estimatedContentHeightPx: 240,
        estimatedHeightPx: 280,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)

    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('keeps the default diff fallback padding aligned with the final surface', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(pre.style.paddingTop).toBe('8px')
    expect(pre.style.paddingBottom).toBe('8px')
    expect(helpers.createCodeBlockRuntime.mock.calls[0]?.[0]?.padding).toBeUndefined()

    wrapper.unmount()
  })

  it('keeps the diff fallback line-number gutter on the editor background', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const value = 1',
          updatedCode: 'const value = 2',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(pre.style.getPropertyValue('--markstream-diff-line-number-bg')).toBe('var(--markstream-diff-editor-bg)')
    expect(pre.style.getPropertyValue('--markstream-diff-added-number-fill')).not.toBe('var(--markstream-diff-editor-bg)')
    expect(pre.style.getPropertyValue('--markstream-diff-removed-number-fill')).not.toBe('var(--markstream-diff-editor-bg)')

    wrapper.unmount()
  })

  it.each(['unified', 'split'] as const)('shows no-final-newline metadata in the initial %s pre', async (diffStyle) => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = "after"',
          raw: '',
          diff: true,
          originalCode: 'const value = "before"',
          updatedCode: 'const value = "after"',
        },
        codeBlockOptions: { diffStyle },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(2)
    expect(wrapper.text()).toContain('No newline at end of file')

    wrapper.unmount()
  })

  it('preserves final newlines when handing a diff pair to the enhanced runtime', async () => {
    const helpers = getStreamDiffsHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = "after"\n',
          raw: '',
          diff: true,
          originalCode: 'const value = "before"\n',
          updatedCode: 'const value = "after"\n',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await vi.waitFor(() => expect(helpers.createDiffEditor).toHaveBeenCalled())
    expect(helpers.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'const value = "before"\n',
      'const value = "after"\n',
      'typescript',
    )

    wrapper.unmount()
  })

  it('keeps the short handoff fixture expanded when the runtime threshold does not fold it', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))
    const code = [
      ' export interface HandoffResult {',
      '   id: string',
      '   description: string',
      ' }',
      ' ',
      ' export function createHandoffResult(id: string): HandoffResult {',
      `-  const description = '${'before-handoff-'.repeat(24)}'`,
      `+  const description = '${'after-handoff-'.repeat(24)}'`,
      '   return { id, description }',
      ' }',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff ts:src/handoff.ts',
          code,
          raw: `\`\`\`diff ts:src/handoff.ts\n${code}`,
          diff: true,
        },
        codeBlockOptions: {
          diffStyle: 'split',
          overflow: 'scroll',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    expect(wrapper.findAll('.markstream-pre__diff-line--collapsed')).toHaveLength(0)
    expect(wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')).toHaveLength(9)
    expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')).toHaveLength(9)
    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(0)
    expect(helpers.createCodeBlockRuntime.mock.calls[0]?.[0]?.collapsedContextThreshold).toBe(5)

    wrapper.unmount()
  })

  it('does not reserve the full source height for a folded diff fallback', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const tenLines = Array.from({ length: 10 }, (_, i) => `const x${i} = ${i}`).join('\n')
    const twoLines = 'const a = 1\nconst b = 2'

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: tenLines,
          updatedCode: twoLines,
        },
        // A large estimate must not force the fallback to its full source height.
        estimatedContentHeightPx: 500,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)

    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('releases the fallback height when unchanged diff rows are folded', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const height = this.matches('pre.code-pre-fallback') ? 360 : 0
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: height,
        width: 0,
        height,
        toJSON: () => ({}),
      } as DOMRect
    })

    const unchanged = Array.from({ length: 24 }, (_, index) => `const shared${index} = ${index}`).join('\n')
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: `const before = true\n${unchanged}`,
          updatedCode: `const after = true\n${unchanged}`,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback')
    expect(pre.classes()).toContain('markstream-pre--diff-collapsed')
    expect((pre.element as HTMLElement).style.height).toBe('')
    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('does not reserve an extra side-by-side diff fallback row for terminal newline', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const patch = [
      '{',
      '  "dependencies": {',
      '-   "stream-diffs": "^0.0.1",',
      '+   "stream-diffs": "^0.0.2",',
      '    "tailwind-merge": "^3.6.0"',
      '  }',
      '}',
      '',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff ts:package.json',
          code: patch,
          raw: '',
          diff: true,
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect(wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')).toHaveLength(6)
    expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')).toHaveLength(6)
    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(0)
    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('does not stretch a near-max side-by-side diff fallback with empty space', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const patch = [
      'const diffCodeBlockOptions = computed<CodeBlockOptions>(() => ({',
      '  ...codeBlockOptions.value,',
      '  padding: { top: 0, bottom: 0 },',
      '-lineDecorationsWidth: 0,',
      '+lineDecorationsWidth: 4,',
      '  glyphMargin: false,',
      '  wordWrap: "off",',
      '  diffStyle: "unified",',
      '  margin: 0,',
      '  padding: 0,',
      '  overflow-x: auto,',
      '+ --context-panel-diff-gutter-marker-width: 4px;',
      '+ --context-panel-diff-line-number-width: 15.6px;',
      '+ --context-panel-diff-line-number-padding-left: 15.6px;',
      '+ --context-panel-diff-line-number-padding-right: 7.8px;',
      '+ --context-panel-diff-line-number-gap-to-code: 7.8px;',
      '+ --context-panel-diff-code-padding-left: 0px;',
      '+ --context-panel-diff-line-number-box-width: calc(var(--context-panel-diff-line-number-padding-left) + var(--context-panel-diff-line-number-width) + var(--context-panel-diff-line-number-padding-right));',
      '+ --context-panel-diff-content-left: calc(var(--context-panel-diff-gutter-marker-width) + var(--context-panel-diff-line-number-box-width) + var(--context-panel-diff-line-number-gap-to-code));',
      '+ --context-panel-diff-right-reserve-width: 7.8px;',
      '+ --markstream-diff-gutter-marker-width: var(--context-panel-diff-gutter-marker-width);',
      '+ --markstream-diff-line-number-left: var(--context-panel-diff-gutter-marker-width);',
      '+ --markstream-diff-line-number-width: var(--context-panel-diff-line-number-width);',
      '+ --markstream-diff-line-number-padding-left: var(--context-panel-diff-line-number-padding-left);',
      '+ --markstream-diff-line-number-padding-right: var(--context-panel-diff-line-number-padding-right);',
      '+ --markstream-diff-line-number-gap-to-code: var(--context-panel-diff-line-number-gap-to-code);',
      '}))',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff ts:DiffView.vue',
          code: patch,
          raw: '',
          diff: true,
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect((pre.element as HTMLElement).style.height).toBe('')
    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('keeps the diff fallback visible before the enhanced surface becomes ready', async () => {
    const helpers = getStreamDiffsHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    // The fallback pre remains visible while the runtime is loading.
    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect(pre.isVisible()).toBe(true)

    wrapper.unmount()
  })
})
