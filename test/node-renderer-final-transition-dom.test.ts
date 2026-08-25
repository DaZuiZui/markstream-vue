import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, onBeforeUnmount, onMounted } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const customId = 'final-transition-dom'

describe('node renderer final transition DOM stability', () => {
  afterEach(() => {
    removeCustomComponents(customId)
  })

  it('does not remount unchanged long paragraph content when final changes', async () => {
    const mounted: string[] = []
    const unmounted: string[] = []
    const ParagraphProbe = defineComponent({
      name: 'ParagraphProbe',
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        onMounted(() => mounted.push(String(props.indexKey)))
        onBeforeUnmount(() => unmounted.push(String(props.indexKey)))
        return () => h('p', {
          'class': 'paragraph-probe',
          'data-index-key': String(props.indexKey),
        }, String((props.node as { raw?: string }).raw ?? ''))
      },
    })
    setCustomComponents(customId, {
      paragraph: ParagraphProbe,
    })
    const content = Array.from({ length: 80 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        content,
        final: false,
        fade: false,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })
    await flushAll()

    const initialElements = wrapper.findAll('.paragraph-probe').map(item => item.element)
    expect(initialElements).toHaveLength(80)
    expect(mounted).toHaveLength(80)

    await wrapper.setProps({ final: true })
    await flushAll()

    const nextElements = wrapper.findAll('.paragraph-probe').map(item => item.element)
    expect(nextElements).toHaveLength(80)
    expect(unmounted).toHaveLength(0)
    expect(mounted).toHaveLength(80)
    expect(nextElements.every((element, index) => element === initialElements[index])).toBe(true)

    wrapper.unmount()
  })

  it('does not remount unchanged paragraph content when fade is disabled after streaming', async () => {
    const mounted: string[] = []
    const unmounted: string[] = []
    const ParagraphProbe = defineComponent({
      name: 'ParagraphProbe',
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        onMounted(() => mounted.push(String(props.indexKey)))
        onBeforeUnmount(() => unmounted.push(String(props.indexKey)))
        return () => h('p', {
          'class': 'paragraph-probe',
          'data-index-key': String(props.indexKey),
        }, String((props.node as { raw?: string }).raw ?? ''))
      },
    })
    setCustomComponents(customId, {
      paragraph: ParagraphProbe,
    })
    const content = '这是一段正在流式输出的 Markdown 文本，完成后 fade 会从 true 变成 false，但内容和节点位置保持不变。'
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        content,
        final: false,
        fade: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })
    await flushAll()

    const initialElement = wrapper.get('.paragraph-probe').element
    expect(mounted).toEqual(['markdown-renderer-0'])

    await wrapper.setProps({ final: true, fade: false })
    await flushAll()

    expect(unmounted).toHaveLength(0)
    expect(mounted).toEqual(['markdown-renderer-0'])
    expect(wrapper.get('.paragraph-probe').element).toBe(initialElement)

    wrapper.unmount()
  })

  it('disables the root intrinsic placeholder for completed stable renders only', async () => {
    const content = Array.from({ length: 80 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')
    const wrapper = mount(NodeRenderer, {
      props: {
        content,
        final: true,
        smoothStreaming: false,
        batchRendering: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: Number.MAX_SAFE_INTEGER,
        nodeVirtual: false,
      },
    })
    await flushAll()

    const root = wrapper.get('.markdown-renderer')
    expect(root.classes()).toContain('stable-layout')
    expect(root.classes()).not.toContain('virtualized')
    expect(root.classes()).not.toContain('virtual-scroll-coordinated')
    wrapper.unmount()

    const streamingWrapper = mount(NodeRenderer, {
      props: {
        content,
        final: false,
        smoothStreaming: false,
        batchRendering: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: Number.MAX_SAFE_INTEGER,
        nodeVirtual: false,
      },
    })
    await flushAll()

    expect(streamingWrapper.get('.markdown-renderer').classes()).not.toContain('stable-layout')
    streamingWrapper.unmount()

    const batchedWrapper = mount(NodeRenderer, {
      props: {
        content,
        final: true,
        mode: 'chat',
        smoothStreaming: false,
      },
    })
    await flushAll()

    expect(batchedWrapper.get('.markdown-renderer').classes()).not.toContain('stable-layout')
    batchedWrapper.unmount()

    const source = readFileSync('src/components/NodeRenderer/NodeRenderer.vue', 'utf8')
    expect(source).toContain(`.markdown-renderer.stable-layout {
  content-visibility: visible;
  contain-intrinsic-size: none;
}`)
  })
})
