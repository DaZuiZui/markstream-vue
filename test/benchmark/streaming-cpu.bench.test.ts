import type { PropType } from 'vue'
import type { MarkstreamVirtualMarkdownProps } from '../../src/composables/useMarkstreamVirtualAdapter'
/**
 * Streaming CPU micro-benchmark covering the hot paths touched by the
 * streaming CPU optimization PR:
 *
 *   A. Virtual timeline render churn — markdownProps/measureRef identity
 *      stability across re-renders (cached getMarkdownProps / measureRecordElement).
 *   B. Virtual timeline end-to-end default slot (full MarkdownRender pipeline).
 *   C. Non-markdown text items — layout signature evaluation cost per tick
 *      (hashTimelineString memoization) with long text payloads.
 *   D. HtmlBlockNode / HtmlInlineNode with custom components — single-pass
 *      tokenize vs the previous double tokenize. The custom widget sits at the
 *      END of the content so the baseline `hasCustomComponents` early-return
 *      cannot mask the second full tokenize.
 *
 * Run the SAME file against `main` (baseline) and against the optimized branch
 * and compare the printed numbers. Timed loops repeat and report the best run
 * to reduce scheduler noise.
 *
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import HtmlBlockNode from '../../src/components/HtmlBlockNode'
import HtmlInlineNode from '../../src/components/HtmlInlineNode'
import MarkstreamVirtualTimeline from '../../src/components/MarkstreamVirtualTimeline'
import { clearGlobalCustomComponents, setCustomComponents } from '../../src/utils/nodeComponents'

/** Child that re-renders whenever the whole payload object identity changes. */
function makeIdentityCounter(label: string) {
  const state = { renders: 0 }
  const C = defineComponent({
    name: `IdentityCounter-${label}`,
    props: {
      payload: { type: Object as PropType<unknown>, default: null },
    },
    setup() {
      return () => {
        state.renders += 1
        return h('span', label)
      }
    },
  })
  return { C, state }
}

function markdownItem(key: string, content: string, final = true) {
  return { id: key, kind: 'markdown', content, final }
}

function toolCallItem(key: string, text: string) {
  return { id: key, kind: 'tool-call', text }
}

const VIRTUAL_TIMELINE_ITEMS = 9
const TICKS = 60
const WARMUP = 4
const REPEATS = 3

function scenarioHeader(name: string) {
  console.info(`\n[streaming-cpu] === ${name} ===`)
}

function averagePerTick(totalMs: number, ticks: number) {
  return `${(totalMs / ticks).toFixed(3)}ms`
}

/**
 * Runs `tickBody(i)` per tick (with a Vue flush after each), repeating the
 * whole run and reporting the best (min) total time.
 */
async function measureRepeated(
  ticks: number,
  tickBody: (i: number) => Promise<void>,
  repeats = REPEATS,
) {
  let best = Infinity
  for (let r = 0; r < repeats; r++) {
    const startedAt = performance.now()
    for (let i = 0; i < ticks; i++) {
      await tickBody(i)
      await nextTick()
    }
    const totalMs = performance.now() - startedAt
    if (totalMs < best)
      best = totalMs
  }
  return best
}

afterEach(() => {
  clearGlobalCustomComponents()
})

describe('streaming CPU benchmark', () => {
  it('a: timeline render churn — markdownProps / measureRef identity', async () => {
    scenarioHeader('A timeline render churn')

    const propsCounter = makeIdentityCounter('mdProps')
    const refCounter = makeIdentityCounter('measureRef')

    const wrapper = mount(MarkstreamVirtualTimeline, {
      props: {
        items: Array.from({ length: VIRTUAL_TIMELINE_ITEMS }, (_, i) =>
          markdownItem(`m${i}`, `## Heading ${i}\n\nStatic paragraph ${i} with some body text.\n\n`)),
        threadKey: 'bench-a',
      },
      slots: {
        default: ({ itemKey, markdownProps, measureRef }: any) => [
          h(propsCounter.C, { key: `${itemKey}-p`, payload: markdownProps as MarkstreamVirtualMarkdownProps }),
          h(refCounter.C, { key: `${itemKey}-r`, payload: measureRef }),
        ],
      },
    })
    await nextTick()

    let streaming = 'First streamed line.\n\n'
    const items = (wrapper.props('items') as any[]).slice()
    const baseProps = propsCounter.state.renders
    const baseRef = refCounter.state.renders

    for (let i = 0; i < WARMUP; i++) {
      streaming += `warmup line ${i} with some words.\n\n`
      items[VIRTUAL_TIMELINE_ITEMS - 1] = markdownItem(`m${VIRTUAL_TIMELINE_ITEMS - 1}`, streaming, false)
      await wrapper.setProps({ items: [...items] })
      await nextTick()
    }

    const totalProps = propsCounter.state.renders - baseProps
    const totalRef = refCounter.state.renders - baseRef

    const best = await measureRepeated(TICKS, async (i) => {
      streaming += `streamed sentence ${i} with several words and detail.\n\n`
      items[VIRTUAL_TIMELINE_ITEMS - 1] = markdownItem(`m${VIRTUAL_TIMELINE_ITEMS - 1}`, streaming, false)
      await wrapper.setProps({ items: [...items] })
    })

    const propsRenders = propsCounter.state.renders - baseProps - totalProps
    const refRenders = refCounter.state.renders - baseRef - totalRef

    console.info(`[streaming-cpu] A ticks=${TICKS} best=${best.toFixed(1)}ms avg=${averagePerTick(best, TICKS)} mdPropsRenders=${propsRenders} measureRefRenders=${refRenders}`)

    wrapper.unmount()
  })

  it('b: timeline default slot end-to-end (full MarkdownRender)', async () => {
    scenarioHeader('B timeline default slot (full MarkdownRender)')

    const wrapper = mount(MarkstreamVirtualTimeline, {
      props: {
        items: [
          markdownItem('b0', '## First\n\nStatic paragraph with a bit of body text.\n\n'),
          toolCallItem('b1', 'tool payload that is fixed'),
          markdownItem('b2', 'Start of stream.\n\n', false),
          toolCallItem('b3', 'another tool payload'),
        ],
        threadKey: 'bench-b',
      },
    })
    await nextTick()

    let streaming = 'Start of stream.\n\n'
    const items = (wrapper.props('items') as any[]).slice()

    for (let i = 0; i < WARMUP; i++) {
      streaming += `warmup ${i}\n\n`
      items[2] = markdownItem('b2', streaming, false)
      await wrapper.setProps({ items: [...items] })
      await nextTick()
    }

    const best = await measureRepeated(TICKS, async (i) => {
      streaming += `streamed paragraph ${i} with several words.\n\n`
      items[2] = markdownItem('b2', streaming, false)
      await wrapper.setProps({ items: [...items] })
    }, 2)

    console.info(`[streaming-cpu] B ticks=${TICKS} best=${best.toFixed(1)}ms avg=${averagePerTick(best, TICKS)}`)

    wrapper.unmount()
  })

  it('c: non-markdown text items — layout signature per tick', async () => {
    scenarioHeader('C layout signature (hashTimelineString)')

    const quiet = makeIdentityCounter('quiet')
    const LONG_TEXT = 'y'.repeat(1600)
    const items = Array.from({ length: 24 }, (_, i) => toolCallItem(`t${i}`, `tool ${i} ${LONG_TEXT}`))

    const wrapper = mount(MarkstreamVirtualTimeline, {
      props: {
        items,
        threadKey: 'bench-c',
      },
      slots: {
        default: ({ itemKey, kind }: any) => h(quiet.C, { key: `${itemKey}-q`, payload: `${kind}` }),
      },
    })
    await nextTick()

    let streamingText = 'start '
    const TICKS_C = 80
    const WARMUP_C = 4

    for (let i = 0; i < WARMUP_C; i++) {
      streamingText += `warm ${i} `
      items[23] = toolCallItem('t23', streamingText)
      await wrapper.setProps({ items: [...items] })
      await nextTick()
    }

    const best = await measureRepeated(TICKS_C, async (i) => {
      streamingText += `sentence ${i} with more words to hash `
      items[23] = toolCallItem('t23', streamingText)
      await wrapper.setProps({ items: [...items] })
    })

    console.info(`[streaming-cpu] C ticks=${TICKS_C} best=${best.toFixed(1)}ms avg=${averagePerTick(best, TICKS_C)}`)

    wrapper.unmount()
  })

  it('d: HtmlBlockNode / HtmlInlineNode custom-component parse per tick', async () => {
    scenarioHeader('D HTML nodes custom-component single-pass tokenize')

    setCustomComponents('bench-d', {
      'my-widget': defineComponent({ setup: () => () => h('span', 'widget') }),
    })

    // Seed content with ~200 lines, custom widget anchored at the END so the
    // baseline `hasCustomComponents` cannot early-return before a full scan.
    let seedLines = ''
    for (let i = 0; i < 200; i++)
      seedLines += `\n<p>seed line ${i} with several words to tokenize</p>`

    const blockNode = {
      type: 'html_block' as const,
      content: '',
      raw: '',
      loading: false,
    }
    const inlineNode = {
      type: 'html_inline' as const,
      content: '',
      loading: false,
    }

    const blockWrapper = mount(HtmlBlockNode, {
      props: { node: { ...blockNode, content: `${seedLines}\n<my-widget>w</my-widget>`, raw: `${seedLines}\n<my-widget>w</my-widget>` }, customId: 'bench-d' },
    })
    const inlineWrapper = mount(HtmlInlineNode, {
      props: { node: { ...inlineNode, content: `${seedLines.replaceAll('<p>', '<span>').replaceAll('</p>', '</span>')}\n<my-widget>w</my-widget>` }, customId: 'bench-d' },
    })
    await nextTick()

    const TICKS_D = 60
    const WARMUP_D = 4

    const run = async (kind: 'block' | 'inline') => {
      // Prepend a line each tick so the widget stays anchored at the end.
      let content = kind === 'block'
        ? `${seedLines}\n<my-widget>w</my-widget>`
        : `${seedLines.replaceAll('<p>', '<span>').replaceAll('</p>', '</span>')}\n<my-widget>w</my-widget>`
      const wrapper = kind === 'block' ? blockWrapper : inlineWrapper
      for (let i = 0; i < WARMUP_D; i++) {
        content = `\n<p>warm line ${i}</p>${content}`
        wrapper.setProps({ node: { ...(kind === 'block' ? blockNode : inlineNode), content } })
        await nextTick()
      }
      const best = await measureRepeated(TICKS_D, async (i) => {
        content = `\n<p>streamed line ${i} with a few words</p>${content}`
        wrapper.setProps({ node: { ...(kind === 'block' ? blockNode : inlineNode), content } })
      })

      console.info(`[streaming-cpu] D ${kind} ticks=${TICKS_D} best=${best.toFixed(1)}ms avg=${averagePerTick(best, TICKS_D)}`)
    }

    await run('block')
    await run('inline')

    blockWrapper.unmount()
    inlineWrapper.unmount()
  })
})
