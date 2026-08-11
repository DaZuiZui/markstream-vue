import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import CodeBlockNode from '../packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue'
import LegacyNodesRenderer from '../packages/markstream-vue2/src/components/NodeRenderer/LegacyNodesRenderer.vue'
import NodeRenderer from '../packages/markstream-vue2/src/components/NodeRenderer/NodeRenderer.vue'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-vue2/src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const customId = 'vue2-heavy-props-test'

const CustomMermaidProbe = defineComponent({
  name: 'CustomMermaidProbe',
  props: {
    node: { type: Object, required: true },
    showHeader: Boolean,
    showZoomControls: Boolean,
    renderDebounceMs: Number,
    previewPollDelayMs: Number,
    estimatedPreviewHeightPx: Number,
  },
  render() {
    return h('div', {
      'class': 'custom-mermaid-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-show-header': String(this.showHeader),
      'data-show-zoom-controls': String(this.showZoomControls),
      'data-render-debounce-ms': String(this.renderDebounceMs),
      'data-preview-poll-delay-ms': String(this.previewPollDelayMs),
      'data-estimated-preview-height': String(this.estimatedPreviewHeightPx ?? ''),
    })
  },
})

const EstimatedPreviewProbe = defineComponent({
  name: 'EstimatedPreviewProbe',
  props: {
    node: { type: Object, required: true },
    estimatedPreviewHeightPx: Number,
  },
  render() {
    return h('div', {
      'class': 'estimated-preview-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-estimated-preview-height': String((this as any).estimatedPreviewHeightPx ?? ''),
    })
  },
})

const ExactLanguageProbe = defineComponent({
  name: 'ExactLanguageProbe',
  props: {
    node: { type: Object, required: true },
    showHeader: Boolean,
  },
  render() {
    return h('div', {
      'class': 'exact-language-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-show-header': String((this as any).showHeader),
    })
  },
})

const GenericCodeBlockProbe = defineComponent({
  name: 'GenericCodeBlockProbe',
  props: {
    node: { type: Object, required: true },
    showHeader: Boolean,
  },
  render() {
    return h('div', {
      'class': 'generic-code-block-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-show-header': String((this as any).showHeader),
    })
  },
})

const GenericCodeBlockAttrsProbe = defineComponent({
  name: 'GenericCodeBlockAttrsProbe',
  inheritAttrs: false,
  props: {
    node: { type: Object, required: true },
  },
  render() {
    return h('div', {
      'class': 'generic-code-block-attrs-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-langs': JSON.stringify((this as any).$attrs.langs ?? null),
    })
  },
})

const CopyEmitterProbe = defineComponent({
  name: 'CopyEmitterProbe',
  props: {
    node: { type: Object, required: true },
  },
  emits: ['copy'],
  setup(props, { emit }) {
    return () => h('button', {
      class: 'copy-emitter-probe',
      onClick: () => emit('copy', (props.node as any).code),
    }, 'copy')
  },
})

const NativeCopyProbe = defineComponent({
  name: 'NativeCopyProbe',
  props: {
    node: { type: Object, required: true },
  },
  render() {
    return h('span', { class: 'native-copy-probe' }, 'math')
  },
})

const ReservedCodeBlockPropsProbe = defineComponent({
  name: 'ReservedCodeBlockPropsProbe',
  props: {
    node: { type: Object, required: true },
    indexKey: { type: [String, Number], required: true },
    showHeader: { type: Boolean, default: true },
  },
  render() {
    return h('div', {
      'class': 'reserved-code-block-props-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-index-key': String((this as any).indexKey),
      'data-show-header': String((this as any).showHeader),
    })
  },
})

const CustomD2Probe = defineComponent({
  name: 'CustomD2Probe',
  props: {
    node: { type: Object, required: true },
    themeId: Number,
  },
  render() {
    return h('div', {
      'class': 'custom-d2-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-theme-id': String((this as any).themeId),
    })
  },
})

const CustomD2LangProbe = defineComponent({
  name: 'CustomD2LangProbe',
  props: {
    node: { type: Object, required: true },
    themeId: Number,
  },
  render() {
    return h('div', {
      'class': 'custom-d2lang-probe',
      'data-language': String((this as any).node?.language ?? ''),
      'data-theme-id': String((this as any).themeId),
    })
  },
})

describe('markstream-vue2 heavy-node prop forwarding', () => {
  afterEach(() => {
    removeCustomComponents(customId)
  })

  it('renders a reserved Mermaid shell before the async component resolves', () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n',
            raw: '```mermaid\nflowchart TD\nA-->B\n```',
          },
        ],
      },
    })

    const shell = wrapper.get('[data-markstream-mermaid="1"]')
    expect(shell.attributes('data-markstream-mode')).toBe('pending')
    expect((shell.get('.mermaid-preview-area').element as HTMLElement).style.height).toBe('500px')
  })

  it('renders a reserved Infographic shell before the async component resolves', () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        nodes: [
          {
            type: 'code_block',
            language: 'infographic',
            code: [
              '# Release progress',
              '- Plan: complete',
              '- Build: active',
              '- Verify: pending',
            ].join('\n'),
            raw: '```infographic\n# Release progress\n- Plan: complete\n```',
          },
        ],
      },
    })

    const shell = wrapper.get('[data-markstream-infographic="1"]')
    expect(shell.attributes('data-markstream-mode')).toBe('pending')
    expect((shell.get('.infographic-preview').element as HTMLElement).style.height).toBe('500px')
  })

  it('injects stable preview height estimates for Mermaid and Infographic custom renderers', async () => {
    setCustomComponents(customId, {
      mermaid: EstimatedPreviewProbe as any,
      infographic: EstimatedPreviewProbe as any,
    })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n',
            raw: '```mermaid\nflowchart TD\nA-->B\n```',
          },
          {
            type: 'code_block',
            language: 'infographic',
            code: [
              '# Release progress',
              '- Plan: complete',
              '- Build: active',
              '- Verify: pending',
            ].join('\n'),
            raw: '```infographic\n# Release progress\n- Plan: complete\n```',
          },
        ],
      },
    })

    await flushAll()

    const probes = wrapper.findAll('.estimated-preview-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0].attributes('data-language')).toBe('mermaid')
    expect(probes[0].attributes('data-estimated-preview-height')).toBe('500')
    expect(probes[1].attributes('data-language')).toBe('infographic')
    expect(probes[1].attributes('data-estimated-preview-height')).toBe('500')
  })

  it('prefers exact language overrides over code_block fallback for custom languages', async () => {
    setCustomComponents(customId, {
      echarts: ExactLanguageProbe as any,
      code_block: GenericCodeBlockProbe as any,
    })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        codeBlockProps: {
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'echarts',
            code: 'option = {}',
            raw: '```echarts\noption = {}\n```',
          },
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    const exact = wrapper.get('.exact-language-probe')
    const generic = wrapper.get('.generic-code-block-probe')
    expect(exact.attributes('data-language')).toBe('echarts')
    expect(exact.attributes('data-show-header')).toBe('false')
    expect(generic.attributes('data-language')).toBe('ts')
    expect(generic.attributes('data-show-header')).toBe('false')
  })

  it('does not forward top-level langs to built-in pre code blocks', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        langs: ['typescript'],
        renderCodeBlocksAsPre: true,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    expect(wrapper.get('pre[data-language="ts"]').attributes('langs')).toBeUndefined()
  })

  it('forwards supported codeBlockProps to built-in pre code blocks', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockProps: {
          showLineNumbers: true,
          diffInline: true,
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1\nexport const next = 2',
            raw: '```ts\nexport const value = 1\nexport const next = 2\n```',
          },
        ],
      },
    })

    await flushAll()

    const pre = wrapper.get('pre[data-language="ts"]')
    expect(pre.attributes('data-markstream-line-numbers')).toBe('1')
    expect(pre.get('.markstream-pre__line-numbers-text').text()).toBe('1\n2')
    expect(pre.attributes('showheader')).toBeUndefined()
  })

  it('uses codeBlockOptions for fallback line numbers unless codeBlockProps overrides them', async () => {
    const defaultWrapper = mount(NodeRenderer as any, {
      props: {
        renderCodeBlocksAsPre: true,
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        }],
      },
    })
    await flushAll()
    const defaultPre = defaultWrapper.get('pre[data-language="ts"]')
    expect(defaultPre.attributes('data-markstream-line-numbers')).toBeUndefined()
    expect((defaultPre.element as HTMLElement).style.whiteSpace).toBe('')
    defaultWrapper.unmount()

    const wrapper = mount(NodeRenderer as any, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { disableLineNumbers: true, overflow: 'scroll' },
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        }],
      },
    })

    await flushAll()
    expect(wrapper.get('pre[data-language="ts"]').attributes('data-markstream-line-numbers')).toBeUndefined()
    expect((wrapper.get('pre[data-language="ts"]').element as HTMLElement).style.whiteSpace).toBe('pre')
    wrapper.unmount()

    const enabled = mount(NodeRenderer as any, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { disableLineNumbers: false },
        codeBlockProps: { showLineNumbers: false },
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        }],
      },
    })
    await flushAll()
    expect(enabled.get('pre[data-language="ts"]').attributes('data-markstream-line-numbers')).toBeUndefined()
    enabled.unmount()

    const optionEnabled = mount(NodeRenderer as any, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { disableLineNumbers: false },
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        }],
      },
    })
    await flushAll()
    expect(optionEnabled.get('pre[data-language="ts"]').attributes('data-markstream-line-numbers')).toBe('1')
    optionEnabled.unmount()

    const overridden = mount(NodeRenderer as any, {
      props: {
        renderCodeBlocksAsPre: true,
        codeBlockOptions: { disableLineNumbers: true, overflow: 'wrap' },
        codeBlockProps: { showLineNumbers: true },
        nodes: [{
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        }],
      },
    })
    await flushAll()
    expect(overridden.get('pre[data-language="ts"]').attributes('data-markstream-line-numbers')).toBe('1')
    expect((overridden.get('pre[data-language="ts"]').element as HTMLElement).style.whiteSpace).toBe('pre-wrap')
    overridden.unmount()
  })

  it('keeps legacy forced-pre defaults and explicit options aligned', async () => {
    const nodes = [{
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    }]
    const wrapper = mount(LegacyNodesRenderer as any, { props: { nodes } })
    await flushAll()
    const pre = () => wrapper.get('pre[data-language="ts"]')
    expect(pre().attributes('data-markstream-line-numbers')).toBeUndefined()
    expect((pre().element as HTMLElement).style.whiteSpace).toBe('')

    wrapper.unmount()

    const optionEnabled = mount(LegacyNodesRenderer as any, {
      props: { codeBlockOptions: { disableLineNumbers: false }, nodes },
    })
    await flushAll()
    expect(optionEnabled.get('pre[data-language="ts"]').attributes('data-markstream-line-numbers')).toBe('1')
    optionEnabled.unmount()

    const explicitDisabled = mount(LegacyNodesRenderer as any, {
      props: {
        codeBlockOptions: { disableLineNumbers: false },
        codeBlockProps: { showLineNumbers: false },
        nodes,
      },
    })
    await flushAll()
    expect(explicitDisabled.get('pre[data-language="ts"]').attributes('data-markstream-line-numbers')).toBeUndefined()
    explicitDisabled.unmount()
  })

  it('uses unified diff options for the built-in fallback layout estimate', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        codeBlockOptions: { diffStyle: 'unified', lineHeight: 18 },
        codeBlockProps: { showHeader: false },
        nodes: [{
          type: 'code_block',
          language: 'diff',
          code: 'next 1\nnext 2\nnext 3',
          diff: true,
          originalCode: 'old 1\nold 2',
          updatedCode: 'next 1\nnext 2\nnext 3',
          raw: '```diff\n-old\n+next\n```',
        }],
      },
    })

    await flushAll()

    const codeBlock = wrapper.findComponent(CodeBlockNode as any)
    expect(codeBlock.props('estimatedDiffInline')).toBe(true)
    expect(codeBlock.props('estimatedContentHeightPx')).toBe(90)
    expect(codeBlock.find('pre.code-pre-fallback').classes()).toContain('markstream-pre--diff-inline')
    wrapper.unmount()
  })

  it('does not forward removed top-level langs to custom code block renderers', async () => {
    setCustomComponents(customId, {
      code_block: GenericCodeBlockAttrsProbe as any,
    })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        langs: ['typescript'],
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    const probe = wrapper.get('.generic-code-block-attrs-probe')
    expect(probe.attributes('data-language')).toBe('ts')
    expect(probe.attributes('data-langs')).toBe('null')
  })

  it('does not let codeBlockProps override reserved code block props', async () => {
    setCustomComponents(customId, {
      code_block: ReservedCodeBlockPropsProbe as any,
    })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        codeBlockProps: {
          node: {
            type: 'code_block',
            language: 'spoofed',
          },
          indexKey: 'spoofed-index',
          key: 'spoofed-key',
          ctx: {},
          renderNode: () => null,
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    const probe = wrapper.get('.reserved-code-block-props-probe')
    expect(probe.attributes('data-language')).toBe('ts')
    expect(probe.attributes('data-index-key')).toBe('markdown-renderer-0')
    expect(probe.attributes('data-show-header')).toBe('false')
  })

  it('does not let codeBlockProps override reserved legacy code block props', async () => {
    setCustomComponents(customId, {
      code_block: ReservedCodeBlockPropsProbe as any,
    })

    const wrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId,
        codeBlockProps: {
          node: {
            type: 'code_block',
            language: 'spoofed',
          },
          indexKey: 'spoofed-index',
          key: 'spoofed-key',
          ctx: {},
          renderNode: () => null,
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    const probe = wrapper.get('.reserved-code-block-props-probe')
    expect(probe.attributes('data-language')).toBe('ts')
    expect(probe.attributes('data-index-key')).toBe('legacy-renderer-0')
    expect(probe.attributes('data-show-header')).toBe('false')
  })

  it('keeps top-level langs off legacy exact custom mermaid renderers', async () => {
    setCustomComponents(customId, {
      mermaid: GenericCodeBlockAttrsProbe as any,
    })

    const wrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId,
        langs: ['mermaid'],
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'flowchart TD\nA-->B',
            raw: '```mermaid\nflowchart TD\nA-->B\n```',
          },
        ],
      },
    })

    await flushAll()

    const probe = wrapper.get('.generic-code-block-attrs-probe')
    expect(probe.attributes('data-language')).toBe('mermaid')
    expect(probe.attributes('data-langs')).toBe('null')
  })

  it('re-emits copy from legacy custom code block renderers', async () => {
    setCustomComponents(customId, {
      code_block: CopyEmitterProbe as any,
    })

    const wrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await wrapper.get('.copy-emitter-probe').trigger('click')

    expect(wrapper.emitted('copy-code')?.[0]).toEqual(['export const value = 1'])
    expect(wrapper.emitted('copy')?.[0]).toEqual(['export const value = 1'])
  })

  it('does not re-emit native copy events from NodeRenderer children', async () => {
    setCustomComponents(customId, {
      math_inline: NativeCopyProbe as any,
    })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        nodes: [
          {
            type: 'math_inline',
            content: 'x + y',
            raw: '$x + y$',
          },
        ],
      },
    })

    wrapper.get('.native-copy-probe').element.dispatchEvent(new Event('copy', { bubbles: true }))

    expect(wrapper.emitted('copy-code')).toBeUndefined()
    expect(wrapper.emitted('copy')).toBeUndefined()
  })

  it('lets d2lang exact overrides beat d2 fallback while keeping d2 props', async () => {
    setCustomComponents(customId, {
      d2: CustomD2Probe as any,
      d2lang: CustomD2LangProbe as any,
    })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        d2Props: {
          themeId: 7,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'd2lang',
            code: 'a -> b',
            raw: '```d2lang\na -> b\n```',
          },
        ],
      },
    })

    await flushAll()

    expect(wrapper.find('.custom-d2-probe').exists()).toBe(false)
    const exact = wrapper.get('.custom-d2lang-probe')
    expect(exact.attributes('data-language')).toBe('d2lang')
    expect(exact.attributes('data-theme-id')).toBe('7')
  })

  it('forwards mermaidProps to custom mermaid renderers', async () => {
    setCustomComponents(customId, { mermaid: CustomMermaidProbe })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph LR\nA-->B\n',
            raw: '```mermaid\ngraph LR\nA-->B\n```',
          },
        ],
        codeBlockProps: {
          showHeader: true,
        },
        mermaidProps: {
          showHeader: false,
          showZoomControls: false,
          renderDebounceMs: 180,
          previewPollDelayMs: 500,
        },
      },
    })

    await flushAll()

    const probe = wrapper.get('.custom-mermaid-probe')
    expect(probe.attributes('data-show-header')).toBe('false')
    expect(probe.attributes('data-show-zoom-controls')).toBe('false')
    expect(probe.attributes('data-render-debounce-ms')).toBe('180')
    expect(probe.attributes('data-preview-poll-delay-ms')).toBe('500')
    expect(probe.attributes('data-estimated-preview-height')).toBe('360')
  })
})
