import type { ParsedNode } from 'stream-markdown-parser'
import type { ComputedRef, Ref } from 'vue'
import type { EstimatedNodeHeight } from '../../../internal/heightEstimationExperiment'
import { clampInfographicPreviewHeight, clampMermaidPreviewHeight, estimateInfographicPreviewHeight, estimateMermaidPreviewHeight } from '../../../utils/diagramHeight'

const HEIGHT_CACHE_WIDTH_BUCKET_PX = 32

export const UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET = -1

export interface VirtualHeightSummary {
  totalNodes: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  estimatedTotalHeight: number
  width: number
}

export interface HeightModelOptions {
  parsedNodes: ComputedRef<ParsedNode[]>
  nodeHeights: Record<number, number>
  heightStats: {
    total: number
    count: number
  }
  heightTreeSize: Ref<number>
  heightSumTree: Ref<number[]>
  heightKnownTree: Ref<number[]>
  averageNodeHeight: ComputedRef<number>
  heightEstimationActive: ComputedRef<boolean>
  estimatedNodeHeights: ComputedRef<readonly (EstimatedNodeHeight | null)[]>
  getContainerWidth: () => number
  shouldCacheStaticFallbackHeight?: () => boolean
  hasCustomParagraphComponent?: () => boolean
  getPrefixCacheKeyParts: () => readonly unknown[]
  fenwickRangeSum: (tree: number[], start: number, end: number) => number
}

export interface BuildVirtualHeightSummaryOptions {
  topSpacerHeight: number
  bottomSpacerHeight: number
  width?: number
}

type HeightFallbackNode = ParsedNode & {
  code?: unknown
  language?: unknown
  header?: { cells?: unknown[] }
  content?: string
  level?: unknown
  depth?: unknown
  rows?: unknown[]
  children?: unknown[]
  items?: unknown[]
  cells?: unknown[]
  text?: string
}

const TEXT_LIKE_PARAGRAPH_LEAF_TYPES = new Set([
  'text',
  'inline_code',
  'emoji',
  'footnote_reference',
])
const TEXT_LIKE_PARAGRAPH_CONTAINER_TYPES = new Set([
  'strong',
  'emphasis',
  'strikethrough',
  'highlight',
  'insert',
  'subscript',
  'superscript',
  'link',
])

export function getHeightCacheWidthBucket(width: unknown) {
  const numeric = Number(width)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET

  return Math.round(numeric / HEIGHT_CACHE_WIDTH_BUCKET_PX)
}

export function estimateTextFallbackHeight(
  text: string,
  width: number,
  minHeight: number,
  lineHeight = 22,
) {
  const source = String(text ?? '')
  if (!source)
    return minHeight

  const charsPerLine = Math.max(18, Math.floor(Math.max(320, width) / 8))
  const hardLines = source.split(/\r?\n/).length
  const softLines = Math.ceil(source.length / charsPerLine)
  const lines = Math.max(1, hardLines, softLines)

  return Math.max(minHeight, Math.ceil(lines * lineHeight + 12))
}

function estimateParagraphFallbackHeight(text: string, width: number) {
  const source = String(text ?? '')
  if (!source)
    return 28

  const charsPerLine = Math.max(18, Math.floor(Math.max(320, width) / 8))
  const hardLines = source.split(/\r?\n/).length
  const softLines = Math.ceil(source.length / charsPerLine)
  const lines = Math.max(1, hardLines, softLines)
  if (lines <= 1)
    return 28

  return estimateTextFallbackHeight(source, width, 34)
}

function estimateHtmlBlockFallbackHeight(raw: string, width: number) {
  const details = raw.match(/^\s*<details\b([^>]*)>/i)
  if (details && !/(?:^|\s)open(?:\s|=|$)/i.test(details[1] ?? '')) {
    const summary = raw.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
      ?.replace(/<[^>]*>/g, '')
      .trim()
    return estimateTextFallbackHeight(summary || 'Details', width, 28, 28)
  }

  return estimateTextFallbackHeight(raw, width, 96)
}

function estimateHeadingFallbackHeight(node: HeightFallbackNode) {
  const level = Number(node.level ?? node.depth)
  if (level >= 4)
    return 20
  if (level === 3)
    return 30
  if (level === 2)
    return 32
  return 44
}

function isTextLikeParagraphFallbackChild(value: unknown): boolean {
  if (!value || typeof value !== 'object')
    return false

  const node = value as HeightFallbackNode
  const type = String(node.type ?? '')
  if (TEXT_LIKE_PARAGRAPH_LEAF_TYPES.has(type))
    return true
  if (!TEXT_LIKE_PARAGRAPH_CONTAINER_TYPES.has(type))
    return false

  const children = node.children
  if (!Array.isArray(children) || !children.length)
    return true

  return children.every(isTextLikeParagraphFallbackChild)
}

function canTrustParagraphStaticFallback(node: HeightFallbackNode, hasCustomParagraphComponent: boolean) {
  if (hasCustomParagraphComponent)
    return false

  const children = node.children
  if (!Array.isArray(children) || !children.length)
    return true

  return children.every(isTextLikeParagraphFallbackChild)
}

function shouldSkipCustomParagraphEstimate(
  type: string | undefined,
  estimate: EstimatedNodeHeight | null | undefined,
  hasCustomParagraphComponent: boolean,
) {
  return Boolean(
    hasCustomParagraphComponent
    && estimate?.kind === 'simple-text'
    && (type === 'paragraph' || type === 'list_item' || type === 'list'),
  )
}

function extractVisibleFallbackText(value: unknown): string {
  if (!value || typeof value !== 'object')
    return ''

  const node = value as HeightFallbackNode
  const type = String(node.type ?? '')
  if (type === 'text')
    return String(node.content ?? node.raw ?? '')
  if (type === 'inline_code')
    return String(node.code ?? node.content ?? node.raw ?? '')
  if (type === 'emoji')
    return String((node as HeightFallbackNode & { name?: unknown }).name ?? node.raw ?? '')
  if (typeof node.text === 'string')
    return node.text

  const parts: string[] = []
  for (const key of ['children', 'items', 'cells', 'rows'] as const) {
    const child = node[key]
    if (Array.isArray(child)) {
      const text = child.map(extractVisibleFallbackText).filter(Boolean).join(' ')
      if (text)
        parts.push(text)
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function containsInlineCodeFallback(value: unknown): boolean {
  if (!value || typeof value !== 'object')
    return false

  const node = value as HeightFallbackNode
  if (node.type === 'inline_code')
    return true

  return (['children', 'items', 'cells', 'rows'] as const).some((key) => {
    const child = node[key]
    return Array.isArray(child) && child.some(containsInlineCodeFallback)
  })
}

function estimateListItemFallbackHeight(text: string, width: number) {
  if (!text)
    return 30

  const charsPerLine = Math.max(18, Math.floor(Math.max(320, width) / 8))
  const hardLines = text.split(/\r?\n/).length
  const softLines = Math.ceil(text.length / charsPerLine)
  const lines = Math.max(1, hardLines, softLines)

  return 30 + Math.max(0, lines - 1) * 26
}

function estimateListFallbackHeight(node: HeightFallbackNode, width: number) {
  const items = Array.isArray(node.items) ? node.items : []
  if (!items.length)
    return 48

  const baseHeight = Math.max(48, items.length * 30 + 12)
  let textHeight = 12
  for (const item of items) {
    const text = extractVisibleFallbackText(item) || String((item as HeightFallbackNode).raw ?? '')
    textHeight += estimateListItemFallbackHeight(text, width)
  }

  const wrappedExtra = Math.max(0, textHeight - baseHeight)
  if (items.length > 20) {
    const longListExtra = Math.round(items.length * 2.4)
    return Math.round(baseHeight + Math.max(longListExtra, Math.min(wrappedExtra, items.length * 3)))
  }

  if (wrappedExtra <= 0)
    return baseHeight

  const maxExtra = items.length > 8
    ? items.length * 8
    : wrappedExtra

  return Math.round(baseHeight + Math.min(wrappedExtra, maxExtra))
}

function getTableRowCells(row: unknown) {
  return Array.isArray((row as HeightFallbackNode | undefined)?.cells)
    ? ((row as HeightFallbackNode).cells ?? [])
    : []
}

function estimateTableRowFallbackHeight(cells: unknown[], width: number) {
  const columnCount = Math.max(1, cells.length)
  const cellWidth = Math.max(80, (width - 32) / columnCount)
  const charsPerLine = Math.max(10, Math.floor(cellWidth / 8))
  const maxLines = Math.max(1, ...cells.map((cell) => {
    const text = extractVisibleFallbackText(cell) || String((cell as HeightFallbackNode | undefined)?.raw ?? '')
    return Math.ceil(text.length / charsPerLine) || 1
  }))

  return 54 + Math.max(0, maxLines - 1) * 34 + (columnCount <= 3 && cells.some(containsInlineCodeFallback) ? 14 : 0)
}

function estimateTableFallbackHeight(node: HeightFallbackNode, width: number) {
  const rows: unknown[] = [
    ...(node.header ? [node.header] : []),
    ...(Array.isArray(node.rows) ? node.rows : []),
  ]
  if (!rows.length) {
    const rowCount = Array.isArray(node.children) ? node.children.length : 3
    return Math.max(120, rowCount * 38 + 48)
  }

  return Math.max(
    120,
    Math.round(4 + rows.reduce<number>((total, row) => {
      return total + estimateTableRowFallbackHeight(getTableRowCells(row), width)
    }, 0)),
  )
}

export function estimateStaticNodeHeightFallback(node: ParsedNode | undefined, width: number) {
  if (!node || typeof node !== 'object')
    return 32

  const fallbackNode = node as HeightFallbackNode
  const type = String(fallbackNode.type ?? '')
  const fallbackWidth = Number.isFinite(width) && width > 0 ? width : 640

  switch (type) {
    case 'heading':
      return estimateHeadingFallbackHeight(fallbackNode)

    case 'paragraph':
      return estimateParagraphFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
      )

    case 'list': {
      return estimateListFallbackHeight(fallbackNode, fallbackWidth)
    }

    case 'list_item':
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        34,
      )

    case 'blockquote':
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        56,
      )

    case 'table': {
      return estimateTableFallbackHeight(fallbackNode, fallbackWidth)
    }

    case 'code_block': {
      const language = String(fallbackNode.language ?? '').trim().toLowerCase()
      const code = String(fallbackNode.code ?? fallbackNode.raw ?? '')
      if (language === 'mermaid')
        return clampMermaidPreviewHeight(estimateMermaidPreviewHeight(code))
      if (language === 'infographic')
        return clampInfographicPreviewHeight(estimateInfographicPreviewHeight(code))
      return estimateTextFallbackHeight(
        code,
        fallbackWidth,
        96,
        20,
      )
    }

    case 'math_block':
      return 72

    case 'image':
      return 220

    case 'admonition':
    case 'vmr_container':
    case 'html_block':
      return estimateHtmlBlockFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
      )

    case 'thematic_break':
      return 24

    default:
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        40,
      )
  }
}

export function useHeightModel(options: HeightModelOptions) {
  let fallbackHeightPrefixDirty = true
  // -1: no dirty range recorded yet; 0: everything stale; k>0: stale from k.
  let fallbackHeightPrefixInvalidFrom = -1
  const fallbackHeightPrefixCache: number[] = [0]
  let fallbackHeightPrefixCacheKey = ''
  let fallbackHeightPrefixAverageNodeHeight = -1

  // Static fallback estimation cache keyed by the parsed node object. The
  // stream parser reuses the exact same objects for the stable prefix across
  // streaming commits, so a cached estimation stays valid for the lifetime of
  // that node reference. Consumer-supplied nodes can mutate in place, so the
  // renderer disables this cache for that input mode.
  const staticFallbackHeightCache = new WeakMap<object, { width: number, height: number }>()

  function getStaticFallbackNodeHeight(node: ParsedNode | undefined, width: number) {
    if (!node || typeof node !== 'object' || options.shouldCacheStaticFallbackHeight?.() === false)
      return estimateStaticNodeHeightFallback(node, width)

    const object = node as object
    const cached = staticFallbackHeightCache.get(object)
    if (cached && cached.width === width)
      return cached.height

    const height = estimateStaticNodeHeightFallback(node, width)
    staticFallbackHeightCache.set(object, { width, height })
    return height
  }

  /**
   * Mark the fallback height prefix stale from `fromIndex` onward.
   *
   * Streaming appends only change the dirty tail (and new nodes are appended
   * at the end), so callers can pass the parser's dirty start or a measured
   * node index to keep the prefix rebuild incremental (O(dirty tail)) instead
   * of a full O(N) rebuild on every commit. Omitting the index (or passing 0)
   * falls back to a full invalidation, which is required whenever the model's
   * structural configuration changes.
   */
  function markFallbackHeightPrefixDirty(fromIndex = 0) {
    fallbackHeightPrefixDirty = true
    if (fromIndex <= 0) {
      fallbackHeightPrefixInvalidFrom = 0
      return
    }
    if (fallbackHeightPrefixInvalidFrom < 0 || fromIndex < fallbackHeightPrefixInvalidFrom)
      fallbackHeightPrefixInvalidFrom = fromIndex
  }

  function getFallbackNodeHeight(index: number) {
    const measured = options.nodeHeights[index]
    if (Number.isFinite(measured) && measured > 0)
      return measured

    const node = options.parsedNodes.value[index]
    const type = (node as HeightFallbackNode | undefined)?.type
    const hasCustomParagraphComponent = Boolean(options.hasCustomParagraphComponent?.())
    const estimate = options.estimatedNodeHeights.value[index]
    const estimated = estimate?.height
    if (
      !shouldSkipCustomParagraphEstimate(type, estimate, hasCustomParagraphComponent)
      && Number.isFinite(estimated)
      && estimated > 0
    ) {
      return estimated
    }

    const staticHeight = getStaticFallbackNodeHeight(
      node,
      options.getContainerWidth() || 640,
    )
    if (
      type === 'heading'
      || (
        type === 'paragraph'
        && staticHeight <= 28
        && canTrustParagraphStaticFallback(
          node as HeightFallbackNode,
          hasCustomParagraphComponent,
        )
      )
    ) {
      return staticHeight
    }

    return Math.max(options.averageNodeHeight.value, staticHeight)
  }

  function getFallbackHeightPrefix() {
    const total = options.parsedNodes.value.length
    const key = options.getPrefixCacheKeyParts().join(':')
    const prefix = fallbackHeightPrefixCache

    // Structural configuration (width bucket, estimation mode, themes, custom
    // paragraph component, ...) invalidates the whole prefix.
    if (fallbackHeightPrefixCacheKey !== key) {
      fallbackHeightPrefixCacheKey = key
      markFallbackHeightPrefixDirty(0)
    }

    // The average height feeds fallback heights for nodes that have neither a
    // measured nor an estimated height. Snapshot it so average drift (normally
    // caused by new measurements) invalidates only when it actually moves.
    const averageNodeHeight = options.averageNodeHeight.value
    if (fallbackHeightPrefixAverageNodeHeight !== averageNodeHeight) {
      fallbackHeightPrefixAverageNodeHeight = averageNodeHeight
      markFallbackHeightPrefixDirty(0)
    }

    // Shrinking the dataset: retained prefix sums stay valid, drop the tail.
    if (prefix.length > total + 1) {
      prefix.length = total + 1
      if (fallbackHeightPrefixInvalidFrom >= 0 && fallbackHeightPrefixInvalidFrom >= prefix.length - 1)
        fallbackHeightPrefixDirty = false
    }

    const cachedLength = prefix.length - 1
    if (!fallbackHeightPrefixDirty) {
      if (cachedLength === total)
        return prefix
      // Pure append with no explicit stale range: resume from the cached end.
      // The retained prefix stays valid because appends never mutate earlier
      // nodes and the parser's dirty-start notifications cover rewrites.
      fallbackHeightPrefixInvalidFrom = cachedLength
    }

    // Never recompute entries that were never computed: the retained prefix
    // [0, cachedLength) is always authoritative for its own range.
    const startIndex = Math.min(fallbackHeightPrefixInvalidFrom, cachedLength)

    if (prefix.length < total + 1)
      prefix.length = total + 1

    for (let i = startIndex; i < total; i++) {
      prefix[i + 1] = prefix[i] + (
        options.heightEstimationActive.value
          ? getFallbackNodeHeight(i)
          : (options.nodeHeights[i] ?? averageNodeHeight)
      )
    }

    fallbackHeightPrefixDirty = false
    fallbackHeightPrefixInvalidFrom = total

    return prefix
  }

  function estimateHeightRangeFromPrefix(start: number, end: number) {
    const total = options.parsedNodes.value.length
    const boundedStart = clamp(Math.trunc(start), 0, total)
    const boundedEnd = clamp(Math.trunc(end), boundedStart, total)
    if (boundedStart >= boundedEnd)
      return 0

    const prefix = getFallbackHeightPrefix()
    return (prefix[boundedEnd] ?? 0) - (prefix[boundedStart] ?? 0)
  }

  function estimateIndexForOffsetFromPrefix(offsetPx: number) {
    const nodes = options.parsedNodes.value
    const total = nodes.length
    if (total <= 0)
      return 0
    if (offsetPx <= 0)
      return 0

    const prefix = getFallbackHeightPrefix()
    const totalHeight = prefix[total] ?? 0
    if (offsetPx >= totalHeight)
      return total - 1

    let low = 0
    let high = total - 1
    let answer = total - 1

    while (low <= high) {
      const mid = (low + high) >> 1
      const midEnd = prefix[mid + 1] ?? 0

      if (midEnd >= offsetPx) {
        answer = mid
        high = mid - 1
      }
      else {
        low = mid + 1
      }
    }

    return answer
  }

  function estimateHeightRange(start: number, end: number) {
    if (start >= end)
      return 0
    if (options.heightEstimationActive.value) {
      return estimateHeightRangeFromPrefix(start, end)
    }
    if (options.heightTreeSize.value !== options.parsedNodes.value.length) {
      let total = 0
      for (let i = start; i < end; i++)
        total += options.nodeHeights[i] ?? options.averageNodeHeight.value
      return total
    }
    const sumTree = options.heightSumTree.value
    const countTree = options.heightKnownTree.value
    if (!sumTree.length || !countTree.length) {
      let total = 0
      for (let i = start; i < end; i++)
        total += options.nodeHeights[i] ?? options.averageNodeHeight.value
      return total
    }
    const sumKnown = options.fenwickRangeSum(sumTree, start, end)
    const countKnown = options.fenwickRangeSum(countTree, start, end)
    const unknownCount = (end - start) - countKnown
    return sumKnown + unknownCount * options.averageNodeHeight.value
  }

  function estimateIndexForOffset(offsetPx: number) {
    if (offsetPx <= 0)
      return 0
    const nodes = options.parsedNodes.value
    if (options.heightEstimationActive.value) {
      return estimateIndexForOffsetFromPrefix(offsetPx)
    }
    if (options.heightTreeSize.value === nodes.length && options.heightSumTree.value.length && options.heightKnownTree.value.length) {
      const avg = options.averageNodeHeight.value
      const sumTree = options.heightSumTree.value
      const countTree = options.heightKnownTree.value
      const prefix = (endExclusive: number) => {
        if (endExclusive <= 0)
          return 0
        const sumKnown = options.fenwickRangeSum(sumTree, 0, endExclusive)
        const countKnown = options.fenwickRangeSum(countTree, 0, endExclusive)
        return sumKnown + (endExclusive - countKnown) * avg
      }
      let low = 0
      let high = nodes.length - 1
      let ans = nodes.length - 1
      while (low <= high) {
        const mid = (low + high) >> 1
        const height = prefix(mid + 1)
        if (height >= offsetPx) {
          ans = mid
          high = mid - 1
        }
        else {
          low = mid + 1
        }
      }
      return ans
    }
    let remaining = offsetPx
    for (let i = 0; i < nodes.length; i++) {
      const height = options.nodeHeights[i] ?? options.averageNodeHeight.value
      if (remaining <= height)
        return i
      remaining -= height
    }
    return Math.max(0, nodes.length - 1)
  }

  function estimateIndexForOffsetFromEnd(offsetPx: number) {
    const nodes = options.parsedNodes.value
    if (!nodes.length)
      return 0
    if (offsetPx <= 0)
      return Math.max(0, nodes.length - 1)
    if (options.heightEstimationActive.value) {
      const prefix = getFallbackHeightPrefix()
      const totalHeight = prefix[nodes.length] ?? 0
      return estimateIndexForOffsetFromPrefix(Math.max(0, totalHeight - offsetPx))
    }
    if (options.heightTreeSize.value === nodes.length) {
      const totalHeight = estimateHeightRange(0, nodes.length)
      const target = Math.max(0, totalHeight - offsetPx)
      return estimateIndexForOffset(target)
    }
    let remaining = offsetPx
    for (let i = nodes.length - 1; i >= 0; i--) {
      const height = options.nodeHeights[i] ?? options.averageNodeHeight.value
      if (remaining <= height)
        return i
      remaining -= height
    }
    return 0
  }

  function getEstimatedNodeHeightCount() {
    if (!options.heightEstimationActive.value)
      return 0

    let count = 0
    const estimates = options.estimatedNodeHeights.value
    for (let i = 0; i < estimates.length; i++) {
      if (!estimates[i])
        continue

      const measuredHeight = options.nodeHeights[i]
      if (Number.isFinite(measuredHeight) && measuredHeight > 0)
        continue

      count++
    }
    return count
  }

  function buildVirtualHeightSummary(summaryOptions: BuildVirtualHeightSummaryOptions): VirtualHeightSummary {
    const totalNodes = options.parsedNodes.value.length

    return {
      totalNodes,
      measuredCount: options.heightStats.count,
      estimatedCount: getEstimatedNodeHeightCount(),
      averageNodeHeight: options.averageNodeHeight.value,
      topSpacerHeight: summaryOptions.topSpacerHeight,
      bottomSpacerHeight: summaryOptions.bottomSpacerHeight,
      estimatedTotalHeight: estimateHeightRange(0, totalNodes),
      width: summaryOptions.width ?? options.getContainerWidth(),
    }
  }

  return {
    markFallbackHeightPrefixDirty,
    getFallbackNodeHeight,
    estimateHeightRange,
    estimateIndexForOffset,
    estimateIndexForOffsetFromEnd,
    getEstimatedNodeHeightCount,
    buildVirtualHeightSummary,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
