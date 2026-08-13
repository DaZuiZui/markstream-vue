import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import NodeRenderer from '../src/components/NodeRenderer'
import PreCodeBlock from '../src/components/PreCodeNode/PreCodeBlock.vue'
import { flushAll } from './setup/flush-all'

describe('nodeRenderer plain pre shared shell', () => {
  it('uses public codeBlockOptions.diffStyle for renderCodeBlocksAsPre layout', async () => {
    const node = {
      type: 'code_block' as const,
      language: 'diff typescript',
      diff: true,
      originalCode: 'const answer = 41',
      updatedCode: 'const answer = 42',
      code: '-const answer = 41\n+const answer = 42',
      raw: '```diff ts:src/answer.ts',
    }
    const wrapper = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { diffStyle: 'unified' },
        batchRendering: false,
        nodes: [node],
      },
    })

    await flushAll()
    expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(1)
    expect(wrapper.get('.markstream-pre__diff-pane').classes()).toContain('markstream-pre__diff-pane--inline')
    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(2)
    expect(wrapper.text()).toContain('No newline at end of file')

    await wrapper.setProps({ codeBlockOptions: { diffStyle: 'split' } })
    await flushAll()
    expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(2)

    wrapper.unmount()
  })

  it.each(['unified', 'split'] as const)('shows no-final-newline metadata in permanent %s pre', async (diffStyle) => {
    const wrapper = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { diffStyle },
        batchRendering: false,
        nodes: [{
          type: 'code_block',
          language: 'typescript',
          diff: true,
          originalCode: 'const answer = 41',
          updatedCode: 'const answer = 42',
          code: 'const answer = 42',
          raw: '',
        }],
      },
    })

    await flushAll()
    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(2)
    expect(wrapper.text()).toContain('No newline at end of file')

    wrapper.unmount()
  })

  it('renders the shared header before the unchanged pre and copies the original node code', async () => {
    const code = 'const answer = 42\n'
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
        fade: false,
        nodeVirtual: false,
        typewriter: false,
        viewportPriority: false,
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code,
          raw: `\`\`\`ts\n${code}\`\`\``,
        }],
      },
    })

    try {
      await flushAll()

      const container = wrapper.get('.code-block-container')
      const header = wrapper.get('.code-block-header')
      const button = wrapper.get('button.code-action-btn')
      const pre = wrapper.get('pre[data-markstream-pre="1"]')

      expect(header.element.parentElement).toBe(container.element)
      expect(container.element.contains(pre.element)).toBe(true)
      expect(header.element.compareDocumentPosition(pre.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(pre.classes()).toEqual(expect.arrayContaining([
        'code-pre-fallback',
        'is-wrap',
        'language-ts',
        'markstream-pre--line-numbers',
      ]))
      expect(pre.attributes('data-markstream-code-theme')).toBe('vitesse-light')
      expect((pre.element as HTMLElement).style.fontSize).toBe('12px')
      expect((pre.element as HTMLElement).style.lineHeight).toBe('18px')
      expect((pre.element as HTMLElement).style.paddingTop).toBe('8px')
      expect((pre.element as HTMLElement).style.paddingBottom).toBe('8px')
      expect((pre.element as HTMLElement).style.tabSize).toBe('4')
      expect(button.attributes('aria-label')).toBe('Copy')

      window.getSelection()?.removeAllRanges()
      await button.trigger('click')
      await flushAll()

      expect(writeText).toHaveBeenCalledWith(code)
      expect(window.getSelection()?.toString()).toBe('')
      expect(window.getSelection()?.rangeCount).toBe(0)
      expect(wrapper.emitted('copy-code')).toEqual([[code]])
      expect(wrapper.emitted('copy')).toEqual([[code]])
    }
    finally {
      wrapper.unmount()
      if (previousClipboard)
        Object.defineProperty(navigator, 'clipboard', previousClipboard)
      else
        Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('aligns wrapped visual rows to logical newline-delimited line numbers', async () => {
    const code = 'const message = "one logical source line that can wrap"\nreturn message\n'
    const wrapper = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { overflow: 'wrap' },
        codeBlockProps: { showLineNumbers: true },
        batchRendering: false,
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code,
          raw: `\`\`\`ts\n${code}\`\`\``,
        }],
      },
    })

    await flushAll()

    const pre = wrapper.get('pre[data-markstream-pre="1"]')
    const logicalLines = pre.findAll('.markstream-pre__logical-line')
    expect(pre.attributes('style')).toContain('white-space: pre-wrap')
    expect(pre.find('.markstream-pre__line-numbers-text').exists()).toBe(false)
    expect(logicalLines.map(line => line.attributes('data-line-number'))).toEqual(['1', '2'])
    expect(pre.get('.markstream-pre__code--wrapped').element.textContent).toBe(
      'const message = "one logical source line that can wrap"\nreturn message',
    )

    wrapper.unmount()
  })

  it('uses the same pre component, theme, typography, spacing, and gutter as CodeBlockNode fallback', async () => {
    const code = 'const first = true\nconst second = false'
    const node = {
      type: 'code_block' as const,
      language: 'ts',
      code,
      raw: `\`\`\`ts\n${code}\n\`\`\``,
      loading: true,
    }
    const codeBlockOptions = {
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Parity Mono',
      padding: 10,
      tabSize: 6,
      overflow: 'wrap' as const,
    }
    const direct = mount(CodeBlockNode, {
      props: {
        node,
        loading: true,
        stream: true,
        showHeader: false,
        isDark: true,
        codeBlockOptions,
      },
    })
    const renderer = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        isDark: true,
        codeBlockOptions,
        codeBlockProps: { showHeader: false },
        batchRendering: false,
        nodes: [node],
      },
    })

    await flushAll()

    const directPre = direct.get('pre[data-markstream-pre="1"]')
    const rendererPre = renderer.get('pre[data-markstream-pre="1"]')
    const directStyle = (directPre.element as HTMLElement).style
    const rendererStyle = (rendererPre.element as HTMLElement).style
    const properties = [
      'background-color',
      'color',
      'font-family',
      'font-size',
      'line-height',
      'max-height',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'tab-size',
      'white-space',
      '--markstream-code-padding-x',
      '--markstream-code-padding-y',
      '--markstream-pre-line-number-gap-to-code',
      '--markstream-pre-resolved-theme-bg',
      '--markstream-pre-resolved-theme-fg',
      '--markstream-pre-resolved-theme-line-number',
    ]

    expect(directPre.classes()).toEqual(rendererPre.classes())
    expect(directPre.attributes('data-markstream-code-theme')).toBe('vitesse-dark')
    expect(rendererPre.attributes('data-markstream-code-theme')).toBe('vitesse-dark')
    for (const property of properties)
      expect(directStyle.getPropertyValue(property), property).toBe(rendererStyle.getPropertyValue(property))

    direct.unmount()
    renderer.unmount()
  })

  it.each([
    { isDark: false, theme: 'vitesse-light', background: '#ffffff', foreground: '#393a34' },
    { isDark: true, theme: 'vitesse-dark', background: '#121212', foreground: '#dbd7caee' },
  ])('keeps the zero-config $theme renderer path identical to the shared CodeBlockNode pre', async ({ isDark, theme, background, foreground }) => {
    const code = 'const first = true\nconst second = false'
    const node = {
      type: 'code_block' as const,
      language: 'ts',
      code,
      raw: `\`\`\`ts\n${code}\n\`\`\``,
      loading: true,
    }
    const shared = mount(PreCodeBlock, {
      props: {
        node,
        loading: true,
        isDark,
        showToolbar: false,
      },
    })
    const direct = mount(CodeBlockNode, {
      props: {
        node,
        loading: true,
        stream: true,
        showHeader: false,
        isDark,
      },
    })
    const renderer = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        isDark,
        codeBlockProps: { showHeader: false },
        batchRendering: false,
        nodes: [node],
      },
    })

    await flushAll()

    const pres = [
      shared.get('pre[data-markstream-pre="1"]'),
      direct.get('pre[data-markstream-pre="1"]'),
      renderer.get('pre[data-markstream-pre="1"]'),
    ]
    const properties = [
      'background-color',
      'color',
      'font-family',
      'font-size',
      'line-height',
      'max-height',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'tab-size',
      'white-space',
      '--markstream-code-padding-x',
      '--markstream-code-padding-y',
      '--markstream-pre-line-number-gap-to-code',
      '--markstream-pre-resolved-theme-bg',
      '--markstream-pre-resolved-theme-fg',
      '--markstream-pre-resolved-theme-line-number',
    ]
    const expectedStyle = (pres[0].element as HTMLElement).style

    for (const pre of pres) {
      const style = (pre.element as HTMLElement).style
      expect(pre.classes()).toEqual(pres[0].classes())
      expect(pre.attributes('data-markstream-code-theme')).toBe(theme)
      expect(style.getPropertyValue('--markstream-pre-resolved-theme-bg')).toBe(background)
      expect(style.getPropertyValue('--markstream-pre-resolved-theme-fg')).toBe(foreground)
      expect(style.fontSize).toBe('12px')
      expect(style.lineHeight).toBe('18px')
      expect(style.paddingTop).toBe('8px')
      expect(style.paddingRight).toBe('1ch')
      expect(style.paddingBottom).toBe('8px')
      expect(style.tabSize).toBe('4')
      for (const property of properties)
        expect(style.getPropertyValue(property), property).toBe(expectedStyle.getPropertyValue(property))
    }

    shared.unmount()
    direct.unmount()
    renderer.unmount()
  })

  it('forwards plain-pre layout and diff props without rich code-block bindings', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { overflow: 'wrap', disableLineNumbers: true },
        codeBlockProps: {
          showHeader: true,
          showCopyButton: true,
          diffHideUnchangedRegions: { enabled: false },
        },
        nodes: [{
          type: 'code_block',
          language: 'diff',
          code: '- old\n+ new\n',
          raw: '```diff\n- old\n+ new\n```',
        }],
      },
    })

    await flushAll()

    const pre = wrapper.get('pre[data-markstream-pre="1"]')
    expect(pre.attributes('style')).toContain('white-space: pre-wrap')
    expect(pre.attributes('data-markstream-line-numbers')).toBeUndefined()
    expect(pre.attributes('showcopybutton')).toBeUndefined()
    expect(pre.attributes('diffhideunchangedregions')).toBeUndefined()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
