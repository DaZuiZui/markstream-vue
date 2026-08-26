/**
 * @vitest-environment node
 */

import type { ParsedNode } from 'stream-markdown-parser'
import type { EstimatedNodeHeight } from '../src/internal/heightEstimationExperiment'
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { useHeightMeasurements } from '../src/components/NodeRenderer/composables/useHeightMeasurements'
import {
  estimateStaticNodeHeightFallback,
  estimateTextFallbackHeight,
  getHeightCacheWidthBucket,
  UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET,
  useHeightModel,
} from '../src/components/NodeRenderer/composables/useHeightModel'

function paragraph(raw: string): ParsedNode {
  return {
    type: 'paragraph',
    raw,
    children: [],
  } as ParsedNode
}

function createModel(options: {
  nodes: ParsedNode[]
  active?: boolean
  estimates?: Array<EstimatedNodeHeight | null>
  hasCustomParagraphComponent?: boolean
  shouldCacheStaticFallbackHeight?: boolean
  width?: number
}) {
  const nodes = ref(options.nodes)
  const active = ref(options.active ?? false)
  const estimates = ref<Array<EstimatedNodeHeight | null>>(options.estimates ?? [])
  const width = ref(options.width ?? 640)
  const measurements = useHeightMeasurements()
  const model = useHeightModel({
    parsedNodes: computed(() => nodes.value),
    nodeHeights: measurements.nodeHeights,
    heightStats: measurements.heightStats,
    heightTreeSize: measurements.heightTreeSize,
    heightSumTree: measurements.heightSumTree,
    heightKnownTree: measurements.heightKnownTree,
    averageNodeHeight: measurements.averageNodeHeight,
    heightEstimationActive: computed(() => active.value),
    estimatedNodeHeights: computed(() => estimates.value),
    getContainerWidth: () => width.value,
    shouldCacheStaticFallbackHeight: () => options.shouldCacheStaticFallbackHeight !== false,
    hasCustomParagraphComponent: () => Boolean(options.hasCustomParagraphComponent),
    getPrefixCacheKeyParts: () => [
      nodes.value.length,
      measurements.heightStats.count,
      Math.round(measurements.heightStats.total),
      Math.round(measurements.averageNodeHeight.value * 100),
      getHeightCacheWidthBucket(width.value),
      active.value ? 1 : 0,
      options.hasCustomParagraphComponent ? 1 : 0,
    ],
    fenwickRangeSum: measurements.fenwickRangeSum,
  })

  return {
    active,
    estimates,
    measurements,
    model,
    nodes,
    width,
  }
}

describe('useHeightModel', () => {
  it('keeps text and static fallback estimates deterministic', () => {
    expect(estimateTextFallbackHeight('', 640, 34)).toBe(34)
    expect(estimateTextFallbackHeight('x'.repeat(200), 320, 34)).toBeGreaterThan(
      estimateTextFallbackHeight('x'.repeat(200), 960, 34),
    )
    expect(estimateStaticNodeHeightFallback(paragraph('short'), 640)).toBe(28)
    expect(estimateStaticNodeHeightFallback(paragraph('x'.repeat(240)), 320)).toBeGreaterThan(
      estimateStaticNodeHeightFallback(paragraph('x'.repeat(240)), 960),
    )
    expect(estimateStaticNodeHeightFallback({
      type: 'list',
      raw: '- a\n- b\n- c',
      ordered: false,
      items: [paragraph('a'), paragraph('b'), paragraph('c')],
    } as ParsedNode, 640)).toBe(102)
    expect(estimateStaticNodeHeightFallback({ type: 'heading', level: 2 } as ParsedNode, 640)).toBe(32)
    expect(estimateStaticNodeHeightFallback({ type: 'heading', level: 3 } as ParsedNode, 640)).toBe(30)
    expect(estimateStaticNodeHeightFallback({ type: 'heading', level: 4 } as ParsedNode, 640)).toBe(20)
    expect(estimateStaticNodeHeightFallback(undefined, 640)).toBe(32)
  })

  it('reserves diagram preview height before offscreen nodes mount', () => {
    const mermaid = estimateStaticNodeHeightFallback({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B',
    } as ParsedNode, 640)
    const infographic = estimateStaticNodeHeightFallback({
      type: 'code_block',
      language: 'infographic',
      code: 'title: History\ndata:\n  - A\n  - B\n  - C',
    } as ParsedNode, 640)
    const ordinaryCode = estimateStaticNodeHeightFallback({
      type: 'code_block',
      language: 'ts',
      code: 'console.log(1)',
    } as ParsedNode, 640)

    expect(mermaid).toBeGreaterThanOrEqual(360)
    expect(infographic).toBeGreaterThanOrEqual(360)
    expect(ordinaryCode).toBe(96)
  })

  it('re-estimates mutable consumer nodes when static caching is disabled', () => {
    const node = {
      type: 'code_block',
      language: 'ts',
      raw: 'consumer-managed source',
      code: 'x',
    } as ParsedNode
    const { model } = createModel({
      nodes: [node],
      shouldCacheStaticFallbackHeight: false,
      width: 320,
    })

    expect(model.getFallbackNodeHeight(0)).toBe(96)
    ;(node as any).code = Array.from({ length: 100 }, () => 'line').join('\n')
    expect(model.getFallbackNodeHeight(0)).toBeGreaterThan(1900)
  })

  it('uses visible text to estimate list and table fallback heights', () => {
    const longItemText = 'Long visible list item text '.repeat(12).trim()
    const list = {
      type: 'list',
      ordered: false,
      items: Array.from({ length: 4 }, () => ({
        type: 'list_item',
        children: [{
          type: 'paragraph',
          children: [{ type: 'text', content: longItemText, raw: longItemText }],
        }],
      })),
    } as ParsedNode
    const table = {
      type: 'table',
      raw: 'A|B|C',
      header: {
        cells: [
          { children: [{ type: 'text', content: 'Need', raw: 'Need' }] },
          { children: [{ type: 'text', content: 'Typical Markdown preview', raw: 'Typical Markdown preview' }] },
          { children: [{ type: 'text', content: 'markstream-vue', raw: 'markstream-vue' }] },
        ],
      },
      rows: Array.from({ length: 5 }, () => ({
        cells: [
          { children: [{ type: 'text', content: 'Streaming input', raw: 'Streaming input' }] },
          { children: [{ type: 'text', content: 'Re-renders whole tree and flashes', raw: 'Re-renders whole tree and flashes' }] },
          { children: [{ type: 'text', content: 'Incremental batches with virtual windowing and stable placeholders', raw: 'Incremental batches with virtual windowing and stable placeholders' }] },
        ],
      })),
    } as unknown as ParsedNode
    const codeTable = {
      ...table,
      rows: [{
        cells: [
          { children: [{ type: 'inline_code', code: 'onClick', raw: 'onClick' }] },
          { children: [{ type: 'inline_code', code: '(event: React.MouseEvent<HTMLDivElement>) => void', raw: '(event: React.MouseEvent<HTMLDivElement>) => void' }] },
          { children: [{ type: 'text', content: 'Click handler for the renderer root', raw: 'Click handler for the renderer root' }] },
        ],
      }],
    } as unknown as ParsedNode
    const textTable = {
      ...table,
      rows: [{
        cells: [
          { children: [{ type: 'text', content: 'onClick', raw: 'onClick' }] },
          { children: [{ type: 'text', content: '(event: React.MouseEvent<HTMLDivElement>) => void', raw: '(event: React.MouseEvent<HTMLDivElement>) => void' }] },
          { children: [{ type: 'text', content: 'Click handler for the renderer root', raw: 'Click handler for the renderer root' }] },
        ],
      }],
    } as unknown as ParsedNode

    expect(estimateStaticNodeHeightFallback(list, 872)).toBeGreaterThan(4 * 30 + 12)
    expect(estimateStaticNodeHeightFallback(table, 872)).toBeGreaterThan(5 * 38 + 48)
    expect(estimateStaticNodeHeightFallback(codeTable, 872)).toBeGreaterThan(estimateStaticNodeHeightFallback(textTable, 872))
  })

  it('estimates closed details html blocks from the visible summary', () => {
    const hidden = Array.from({ length: 20 }, (_, index) => `Hidden paragraph ${index + 1}`).join('\n')
    const closed = estimateStaticNodeHeightFallback({
      type: 'html_block',
      raw: `<details>\n<summary>Optional setup</summary>\n\n${hidden}\n</details>`,
    } as ParsedNode, 640)
    const open = estimateStaticNodeHeightFallback({
      type: 'html_block',
      raw: `<details open>\n<summary>Optional setup</summary>\n\n${hidden}\n</details>`,
    } as ParsedNode, 640)

    expect(closed).toBe(40)
    expect(open).toBeGreaterThan(closed)
  })

  it('does not treat data-open as an open details attribute', () => {
    const hidden = 'hidden\n'.repeat(50)
    const closed = estimateStaticNodeHeightFallback({
      type: 'html_block',
      raw: `<details data-open="false">\n<summary>Optional setup</summary>\n\n${hidden}</details>`,
    } as ParsedNode, 640)

    expect(closed).toBe(40)
  })

  it('uses measured Fenwick trees for range and offset lookup when estimation is inactive', () => {
    const { measurements, model } = createModel({
      nodes: [
        paragraph('a'),
        paragraph('b'),
        paragraph('c'),
        paragraph('d'),
      ],
    })

    measurements.recordNodeHeight(0, 10)
    measurements.recordNodeHeight(2, 30)
    measurements.rebuildHeightTrees(4)

    expect(measurements.averageNodeHeight.value).toBe(20)
    expect(model.estimateHeightRange(0, 4)).toBe(80)
    expect(model.estimateHeightRange(1, 3)).toBe(50)
    expect(model.estimateIndexForOffset(1)).toBe(0)
    expect(model.estimateIndexForOffset(11)).toBe(1)
    expect(model.estimateIndexForOffset(60)).toBe(2)
    expect(model.estimateIndexForOffsetFromEnd(25)).toBe(2)
  })

  it('prefers active node estimates but keeps measured heights authoritative', () => {
    const { measurements, model } = createModel({
      active: true,
      nodes: [
        paragraph('first'),
        paragraph('second'),
        paragraph('third'),
      ],
      estimates: [
        { kind: 'simple-text', height: 50 },
        null,
        { kind: 'simple-text', height: 70 },
      ],
    })

    measurements.recordNodeHeight(2, 20)

    expect(model.getFallbackNodeHeight(0)).toBe(50)
    expect(model.getFallbackNodeHeight(1)).toBe(28)
    expect(model.getFallbackNodeHeight(2)).toBe(20)
    expect(model.estimateHeightRange(0, 3)).toBe(98)
    expect(model.estimateIndexForOffset(84)).toBe(2)
    expect(model.estimateIndexForOffsetFromEnd(21)).toBe(1)
    expect(model.buildVirtualHeightSummary({
      topSpacerHeight: 50,
      bottomSpacerHeight: 20,
      width: 640,
    })).toMatchObject({
      totalNodes: 3,
      measuredCount: 1,
      estimatedCount: 1,
      topSpacerHeight: 50,
      bottomSpacerHeight: 20,
      estimatedTotalHeight: 98,
      width: 640,
    })
  })

  it('does not lift stable one-line block fallbacks to the measured average height', () => {
    const { measurements, model } = createModel({
      nodes: [
        { type: 'heading', level: 3, raw: '### Changelog section', children: [] } as ParsedNode,
        paragraph('short fallback'),
        paragraph('x'.repeat(100)),
        paragraph('measured tall block'),
      ],
    })

    measurements.recordNodeHeight(3, 80)

    expect(model.getFallbackNodeHeight(0)).toBe(30)
    expect(model.getFallbackNodeHeight(1)).toBe(28)
    expect(model.getFallbackNodeHeight(2)).toBe(80)
  })

  it('keeps non-text and custom paragraph fallbacks protected by the measured average', () => {
    const nonTextParagraphs = [
      {
        type: 'paragraph',
        raw: '![Alt text](https://example.com/image.png)',
        children: [{
          type: 'image',
          src: 'https://example.com/image.png',
          alt: 'Alt text',
          raw: '![Alt text](https://example.com/image.png)',
        }],
      },
      {
        type: 'paragraph',
        raw: '[![Alt text](https://example.com/image.png)](https://example.com)',
        children: [{
          type: 'link',
          href: 'https://example.com',
          children: [{
            type: 'image',
            src: 'https://example.com/image.png',
            alt: 'Alt text',
            raw: '![Alt text](https://example.com/image.png)',
          }],
        }],
      },
      {
        type: 'paragraph',
        raw: '$E = mc^2$',
        children: [{ type: 'math_inline', content: 'E = mc^2', raw: '$E = mc^2$' }],
      },
      {
        type: 'paragraph',
        raw: '<Badge>New</Badge>',
        children: [{ type: 'html_inline', content: '<Badge>New</Badge>', raw: '<Badge>New</Badge>' }],
      },
      {
        type: 'paragraph',
        raw: '<CustomThing />',
        children: [{ type: 'custom_thing', raw: '<CustomThing />' }],
      },
    ] as unknown as ParsedNode[]
    const media = createModel({
      nodes: [...nonTextParagraphs, paragraph('measured tall block')],
    })

    media.measurements.recordNodeHeight(nonTextParagraphs.length, 80)

    for (let index = 0; index < nonTextParagraphs.length; index++)
      expect(media.model.getFallbackNodeHeight(index)).toBe(80)

    const custom = createModel({
      hasCustomParagraphComponent: true,
      nodes: [paragraph('short fallback'), paragraph('measured tall block')],
      estimates: [
        { kind: 'simple-text', height: 28 },
        null,
      ],
    })

    custom.measurements.recordNodeHeight(1, 80)

    expect(custom.model.getFallbackNodeHeight(0)).toBe(80)

    const listItem = {
      type: 'list_item',
      raw: '- short fallback',
      children: [paragraph('short fallback')],
    } as unknown as ParsedNode
    const list = {
      type: 'list',
      ordered: false,
      raw: '- short fallback',
      items: [listItem],
    } as unknown as ParsedNode
    const customList = createModel({
      hasCustomParagraphComponent: true,
      nodes: [listItem, list, paragraph('measured tall block')],
      estimates: [
        { kind: 'simple-text', height: 28 },
        { kind: 'simple-text', height: 48 },
        null,
      ],
    })

    customList.measurements.recordNodeHeight(2, 80)

    expect(customList.model.getFallbackNodeHeight(0)).toBe(80)
    expect(customList.model.getFallbackNodeHeight(1)).toBe(80)
  })

  it('invalidates active fallback prefixes when cache key parts change', () => {
    const { model, width } = createModel({
      active: true,
      nodes: [paragraph('x'.repeat(200))],
      width: 320,
    })

    const narrowHeight = model.estimateHeightRange(0, 1)

    width.value = 960

    expect(model.estimateHeightRange(0, 1)).toBeLessThan(narrowHeight)
  })

  it('maps width buckets consistently', () => {
    expect(getHeightCacheWidthBucket(0)).toBe(UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET)
    expect(getHeightCacheWidthBucket(Number.NaN)).toBe(UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET)
    expect(getHeightCacheWidthBucket(64)).toBe(2)
    expect(getHeightCacheWidthBucket(80)).toBe(3)
  })
})
