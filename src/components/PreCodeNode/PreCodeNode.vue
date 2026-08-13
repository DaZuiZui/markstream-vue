<script setup lang="ts">
import type { CodeBlockDiffHideUnchangedRegionsOptions, PreCodeNodeProps } from '../../types/component-props'

import { computed, normalizeClass, normalizeStyle, onBeforeUnmount, ref, useAttrs, watch } from 'vue'

const props = defineProps<PreCodeNodeProps>()
const attrs = useAttrs()

function getDisplayCode(code: unknown, loading?: boolean) {
  const value = String(code ?? '')
  return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

// Normalize language to a safe, lowercase token (fallback to 'plaintext')
const normalizedLanguage = computed(() => {
  const raw = String(props.node?.language ?? '')
  const head = String(String(raw).split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
})

const languageClass = computed(() => `language-${normalizedLanguage.value}`)
const isLoading = computed(() => props.loading === true || props.node?.loading === true)
const displayCode = computed(() => getDisplayCode(props.node?.code, isLoading.value))

let countedCode = ''
let countedLines = 1
function countCodeLines(code: string) {
  let start = 0
  let count = 1

  if (code.startsWith(countedCode)) {
    start = countedCode.length
    count = countedLines
    if (start > 0 && code[start - 1] === '\r' && code[start] === '\n')
      start++
  }

  for (let index = start; index < code.length; index++) {
    if (code[index] === '\n') {
      count++
    }
    else if (code[index] === '\r') {
      count++
      if (code[index + 1] === '\n')
        index++
    }
  }

  countedCode = code
  countedLines = count
  return count
}

const codeLineCount = computed(() => countCodeLines(displayCode.value))
const codeLines = computed(() => {
  return displayCode.value.split(/\r\n|\n|\r/)
})
const logicalCodeLines = computed(() => {
  const code = displayCode.value
  const lines: string[] = []
  const lineBreak = /\r\n|\n|\r/g
  let start = 0
  let match = lineBreak.exec(code)

  while (match) {
    lines.push(code.slice(start, lineBreak.lastIndex))
    start = lineBreak.lastIndex
    match = lineBreak.exec(code)
  }

  lines.push(code.slice(start))
  return lines
})

function isWrappingWhiteSpace(value: unknown) {
  return value === 'pre-wrap' || value === 'break-spaces'
}

const isDiffPreview = computed(() => props.showLineNumbers === true && props.node?.diff === true)

function wrapsPlainCodeLines() {
  if (props.showLineNumbers !== true || props.node?.diff === true)
    return false

  if (normalizeClass(attrs.class).split(/\s+/).includes('is-wrap'))
    return true

  const style = normalizeStyle(attrs.style)
  if (typeof style === 'string')
    return /(?:^|;)\s*white-space\s*:\s*(?:pre-wrap|break-spaces)(?:\s*!important)?\s*(?:;|$)/i.test(style)

  return isWrappingWhiteSpace(style?.whiteSpace ?? style?.['white-space'])
}

const wrapsDiffPreviewLines = computed(() => {
  if (!isDiffPreview.value)
    return false

  if (normalizeClass(attrs.class).split(/\s+/).includes('is-wrap'))
    return true

  const style = normalizeStyle(attrs.style)
  if (typeof style === 'string')
    return /(?:^|;)\s*white-space\s*:\s*(?:pre-wrap|break-spaces)(?:\s*!important)?\s*(?:;|$)/i.test(style)

  return isWrappingWhiteSpace(style?.whiteSpace ?? style?.['white-space'])
})

let lineNumbersTextCount = 0
let lineNumbersTextCache = ''
const lineNumbersText = computed(() => {
  const count = codeLineCount.value
  if (count < lineNumbersTextCount) {
    lineNumbersTextCount = 0
    lineNumbersTextCache = ''
  }
  for (let line = lineNumbersTextCount + 1; line <= count; line++)
    lineNumbersTextCache += `${lineNumbersTextCache ? '\n' : ''}${line}`
  lineNumbersTextCount = count
  return lineNumbersTextCache
})
const isInlineDiffPreview = computed(() => isDiffPreview.value && props.diffInline === true)
const reservedHeightStyle = computed(() => {
  const value = Number(props.reservedHeightPx)
  if (!Number.isFinite(value) || value <= 0)
    return undefined

  const height = `${Math.ceil(value)}px`

  if (isLoading.value) {
    return {
      maxHeight: height,
      overflow: 'auto',
    }
  }

  return {
    height,
    minHeight: height,
    maxHeight: height,
    overflow: 'auto',
  }
})

type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk' | 'collapsed' | 'metadata' | 'spacer'
const DIFF_HEADER_PREFIXES = ['diff ', 'index ', '--- ', '+++ ', '@@ ']
const NO_NEWLINE_METADATA = '\\ No newline at end of file'

interface DiffPreviewLine {
  code: string
  kind: DiffPreviewLineKind
  metadataKind?: 'context' | 'removed' | 'added'
  empty: boolean
  key: string
  number: number | string
}

interface DiffPreviewPane {
  key: string
  className: string
  lines: DiffPreviewLine[]
}

interface SourceLineMatch {
  originalIndex: number
  modifiedIndex: number
}

function isBlankDiffPreviewLine(code: string) {
  return String(code ?? '').trim().length === 0
}

function toDiffPreviewLine(
  code: string,
  kind: DiffPreviewLineKind = 'context',
  options: { preserveBlankKind?: boolean } = {},
) {
  const empty = isBlankDiffPreviewLine(code)
  return {
    code,
    // Do not paint terminal blank lines / visual spacer rows as added/removed.
    // This keeps the pre fallback close to stream-diffs, where the empty continuation
    // surface should not flash red/green before highlighting is ready.
    kind: empty && kind !== 'hunk' && kind !== 'spacer' && !options.preserveBlankKind ? 'context' : kind,
    empty,
  }
}

function splitDiffSource(source: unknown) {
  const code = getDisplayCode(source, isLoading.value)
  if (!code)
    return []
  return code.split(/\r\n|\n|\r/)
}

function hasFinalNewline(source: unknown) {
  return String(source ?? '').endsWith('\n')
}

function createMetadataLine(
  key: string,
  metadataKind: 'context' | 'removed' | 'added',
): DiffPreviewLine {
  return {
    ...toDiffPreviewLine('No newline at end of file', 'metadata'),
    key,
    metadataKind,
    number: '',
  }
}

function appendInlineSourceMetadata(
  lines: DiffPreviewLine[],
  originalSource: unknown,
  modifiedSource: unknown,
) {
  const originalMissing = String(originalSource ?? '').length > 0 && !hasFinalNewline(originalSource)
  const modifiedMissing = String(modifiedSource ?? '').length > 0 && !hasFinalNewline(modifiedSource)
  if (!originalMissing && !modifiedMissing)
    return lines

  if (originalMissing)
    lines.push(createMetadataLine('inline-no-newline-original', 'removed'))
  if (modifiedMissing)
    lines.push(createMetadataLine('inline-no-newline-modified', 'added'))
  return lines
}

function shouldPreserveSourceBlankDiffKind(lines: string[], index: number) {
  return !isBlankDiffPreviewLine(lines[index]) || index < lines.length - 1
}

function isRemovedDiffLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedDiffLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
}

function hasUnifiedDiffHeaders(lines: string[]) {
  return lines.some(line => DIFF_HEADER_PREFIXES.some(prefix => line.startsWith(prefix)))
}

function normalizeLooseDiffBody(body: string, hasHeaders: boolean) {
  return !hasHeaders && body.startsWith(' ') && !body.startsWith('  ')
    ? ` ${body}`
    : body
}

function isExplicitDiffLanguage() {
  if (normalizedLanguage.value === 'diff')
    return true

  const firstLine = String(props.node?.raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  return /^`{3,}\s*diff(?:\s|$)|^~{3,}\s*diff(?:\s|$)/.test(firstLine)
}

function hasPatchLines(lines: string[]) {
  const hasRemoved = lines.some(line => isRemovedDiffLine(line))
  const hasAdded = lines.some(line => isAddedDiffLine(line))
  return (hasRemoved && hasAdded)
    || (isExplicitDiffLanguage() && (hasRemoved || hasAdded))
}

function hasDiffSourcePair() {
  return props.node?.originalCode != null || props.node?.updatedCode != null
}

function computeSourceLineMatches(original: string[], modified: string[]): SourceLineMatch[] {
  const n = original.length
  const m = modified.length
  const prefixMatches: SourceLineMatch[] = []
  let start = 0
  while (start < n && start < m && original[start] === modified[start]) {
    prefixMatches.push({ originalIndex: start, modifiedIndex: start })
    start++
  }

  const suffixMatches: SourceLineMatch[] = []
  let originalEnd = n - 1
  let modifiedEnd = m - 1
  while (
    originalEnd >= start
    && modifiedEnd >= start
    && original[originalEnd] === modified[modifiedEnd]
  ) {
    suffixMatches.unshift({ originalIndex: originalEnd, modifiedIndex: modifiedEnd })
    originalEnd--
    modifiedEnd--
  }

  const middleOriginalLength = originalEnd - start + 1
  const middleModifiedLength = modifiedEnd - start + 1
  if (middleOriginalLength <= 0 || middleModifiedLength <= 0)
    return prefixMatches.concat(suffixMatches)
  if (isLoading.value)
    return prefixMatches.concat(suffixMatches)

  const maxCells = 1_500_000
  if ((middleOriginalLength + 1) * (middleModifiedLength + 1) > maxCells)
    return prefixMatches.concat(suffixMatches)

  const cols = middleModifiedLength + 1
  const dp = new Uint32Array((middleOriginalLength + 1) * (middleModifiedLength + 1))
  for (let i = middleOriginalLength - 1; i >= 0; i--) {
    for (let j = middleModifiedLength - 1; j >= 0; j--) {
      const index = i * cols + j
      if (original[start + i] === modified[start + j]) {
        dp[index] = dp[(i + 1) * cols + j + 1] + 1
      }
      else {
        const top = dp[(i + 1) * cols + j]
        const left = dp[i * cols + j + 1]
        dp[index] = top >= left ? top : left
      }
    }
  }

  const matches: SourceLineMatch[] = []
  let i = 0
  let j = 0
  while (i < middleOriginalLength && j < middleModifiedLength) {
    if (original[start + i] === modified[start + j]) {
      matches.push({ originalIndex: start + i, modifiedIndex: start + j })
      i++
      j++
    }
    else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
      i++
    }
    else {
      j++
    }
  }
  return prefixMatches.concat(matches, suffixMatches)
}

function buildInlinePatchPreviewLines(lines: string[]): DiffPreviewLine[] {
  const result: DiffPreviewLine[] = []
  let originalLine = 1
  let modifiedLine = 1
  const hasHeaders = hasUnifiedDiffHeaders(lines)

  for (const [index, raw] of lines.entries()) {
    if (raw === NO_NEWLINE_METADATA) {
      const previousKind = result.at(-1)?.kind
      const metadataKind = previousKind === 'removed' || previousKind === 'added'
        ? previousKind
        : 'context'
      result.push(createMetadataLine(`inline-no-newline-${index}`, metadataKind))
    }
    else if (raw.startsWith('@@')) {
      const match = raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
      if (match) {
        originalLine = Number(match[1])
        modifiedLine = Number(match[2])
      }
      result.push({
        ...toDiffPreviewLine(raw, 'hunk'),
        key: `inline-hunk-${index}`,
        number: '',
      })
    }
    else if (isRemovedDiffLine(raw)) {
      result.push({
        ...toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'removed', { preserveBlankKind: true }),
        key: `inline-removed-${index}`,
        number: originalLine++,
      })
    }
    else if (isAddedDiffLine(raw)) {
      result.push({
        ...toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'added', { preserveBlankKind: true }),
        key: `inline-added-${index}`,
        number: modifiedLine++,
      })
    }
    else {
      const code = hasHeaders && raw.startsWith(' ') ? raw.slice(1) : raw
      result.push({
        ...toDiffPreviewLine(code),
        key: `inline-context-${index}`,
        number: modifiedLine,
      })
      originalLine++
      modifiedLine++
    }
  }

  return result
}

function buildInlineSourcePreviewLines(originalSource: unknown, modifiedSource: unknown): DiffPreviewLine[] {
  const original = splitDiffSource(originalSource)
  const modified = splitDiffSource(modifiedSource)
  const matches = computeSourceLineMatches(original, modified)
  if (matches.length > 0) {
    const result: DiffPreviewLine[] = []
    let originalIndex = 0
    let modifiedIndex = 0

    for (const match of matches) {
      while (originalIndex < match.originalIndex) {
        result.push({
          ...toDiffPreviewLine(original[originalIndex], 'removed', {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
          }),
          key: `inline-removed-source-${originalIndex}`,
          number: originalIndex + 1,
        })
        originalIndex++
      }
      while (modifiedIndex < match.modifiedIndex) {
        result.push({
          ...toDiffPreviewLine(modified[modifiedIndex], 'added', {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
          }),
          key: `inline-added-source-${modifiedIndex}`,
          number: modifiedIndex + 1,
        })
        modifiedIndex++
      }
      result.push({
        ...toDiffPreviewLine(modified[match.modifiedIndex]),
        key: `inline-context-source-${match.originalIndex}-${match.modifiedIndex}`,
        number: match.modifiedIndex + 1,
      })
      originalIndex = match.originalIndex + 1
      modifiedIndex = match.modifiedIndex + 1
    }

    while (originalIndex < original.length) {
      result.push({
        ...toDiffPreviewLine(original[originalIndex], 'removed', {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
        }),
        key: `inline-removed-source-${originalIndex}`,
        number: originalIndex + 1,
      })
      originalIndex++
    }
    while (modifiedIndex < modified.length) {
      result.push({
        ...toDiffPreviewLine(modified[modifiedIndex], 'added', {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
        }),
        key: `inline-added-source-${modifiedIndex}`,
        number: modifiedIndex + 1,
      })
      modifiedIndex++
    }

    return result
  }

  const result: DiffPreviewLine[] = []
  let start = 0
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1

  while (
    start <= originalEnd
    && start <= modifiedEnd
    && original[start] === modified[start]
  ) {
    result.push({
      ...toDiffPreviewLine(modified[start]),
      key: `inline-prefix-${start}`,
      number: start + 1,
    })
    start++
  }

  const suffix: DiffPreviewLine[] = []
  while (
    originalEnd >= start
    && modifiedEnd >= start
    && original[originalEnd] === modified[modifiedEnd]
  ) {
    suffix.unshift({
      ...toDiffPreviewLine(modified[modifiedEnd]),
      key: `inline-suffix-${modifiedEnd}`,
      number: modifiedEnd + 1,
    })
    originalEnd--
    modifiedEnd--
  }

  for (let index = start; index <= originalEnd; index++) {
    result.push({
      ...toDiffPreviewLine(original[index], 'removed', {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, index),
      }),
      key: `inline-removed-source-${index}`,
      number: index + 1,
    })
  }

  for (let index = start; index <= modifiedEnd; index++) {
    result.push({
      ...toDiffPreviewLine(modified[index], 'added', {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, index),
      }),
      key: `inline-added-source-${index}`,
      number: index + 1,
    })
  }

  return result.concat(suffix)
}

function buildSideBySideSourcePreviewPanes(
  originalSource: unknown,
  modifiedSource: unknown,
): DiffPreviewPane[] {
  const originalSourceLines = splitDiffSource(originalSource)
  const modifiedSourceLines = splitDiffSource(modifiedSource)
  const matches = computeSourceLineMatches(originalSourceLines, modifiedSourceLines)
  const originalLines: DiffPreviewLine[] = []
  const modifiedLines: DiffPreviewLine[] = []
  let originalIndex = 0
  let modifiedIndex = 0
  let blockIndex = 0

  const appendChangedBlock = (originalEnd: number, modifiedEnd: number) => {
    const rowCount = Math.max(originalEnd - originalIndex, modifiedEnd - modifiedIndex)
    for (let offset = 0; offset < rowCount; offset++) {
      const nextOriginalIndex = originalIndex + offset
      const nextModifiedIndex = modifiedIndex + offset
      originalLines.push(nextOriginalIndex < originalEnd
        ? {
            ...toDiffPreviewLine(originalSourceLines[nextOriginalIndex], 'removed', {
              preserveBlankKind: shouldPreserveSourceBlankDiffKind(originalSourceLines, nextOriginalIndex),
            }),
            key: `original-changed-${blockIndex}-${nextOriginalIndex}`,
            number: nextOriginalIndex + 1,
          }
        : {
            ...toDiffPreviewLine('', 'spacer'),
            key: `original-spacer-${blockIndex}-${offset}`,
            number: '',
          })
      modifiedLines.push(nextModifiedIndex < modifiedEnd
        ? {
            ...toDiffPreviewLine(modifiedSourceLines[nextModifiedIndex], 'added', {
              preserveBlankKind: shouldPreserveSourceBlankDiffKind(modifiedSourceLines, nextModifiedIndex),
            }),
            key: `modified-changed-${blockIndex}-${nextModifiedIndex}`,
            number: nextModifiedIndex + 1,
          }
        : {
            ...toDiffPreviewLine('', 'spacer'),
            key: `modified-spacer-${blockIndex}-${offset}`,
            number: '',
          })
    }
    originalIndex = originalEnd
    modifiedIndex = modifiedEnd
    blockIndex++
  }

  for (const match of matches) {
    appendChangedBlock(match.originalIndex, match.modifiedIndex)
    originalLines.push({
      ...toDiffPreviewLine(originalSourceLines[match.originalIndex]),
      key: `original-context-${match.originalIndex}-${match.modifiedIndex}`,
      number: match.originalIndex + 1,
    })
    modifiedLines.push({
      ...toDiffPreviewLine(modifiedSourceLines[match.modifiedIndex]),
      key: `modified-context-${match.originalIndex}-${match.modifiedIndex}`,
      number: match.modifiedIndex + 1,
    })
    originalIndex = match.originalIndex + 1
    modifiedIndex = match.modifiedIndex + 1
  }
  appendChangedBlock(originalSourceLines.length, modifiedSourceLines.length)

  const originalMissing = String(originalSource ?? '').length > 0 && !hasFinalNewline(originalSource)
  const modifiedMissing = String(modifiedSource ?? '').length > 0 && !hasFinalNewline(modifiedSource)
  if (originalMissing || modifiedMissing) {
    originalLines.push(originalMissing
      ? createMetadataLine('original-no-newline', 'removed')
      : {
          ...toDiffPreviewLine('', 'spacer'),
          key: 'original-no-newline-spacer',
          number: '',
        })
    modifiedLines.push(modifiedMissing
      ? createMetadataLine('modified-no-newline', 'added')
      : {
          ...toDiffPreviewLine('', 'spacer'),
          key: 'modified-no-newline-spacer',
          number: '',
        })
  }

  return collapseDiffPanes([
    {
      key: 'original',
      className: 'markstream-pre__diff-pane--original',
      lines: originalLines,
    },
    {
      key: 'modified',
      className: 'markstream-pre__diff-pane--modified',
      lines: modifiedLines,
    },
  ])
}

function resolveDiffCollapseOptions() {
  const value = props.diffHideUnchangedRegions
  if (value == null || value === false)
    return null
  const options: CodeBlockDiffHideUnchangedRegionsOptions = value === true ? {} : value
  if (options.enabled === false)
    return null
  return {
    contextLineCount: Math.max(0, Math.floor(options.contextLineCount ?? 2)),
    minimumLineCount: Math.max(1, Math.floor(options.minimumLineCount ?? 4)),
  }
}

function collapseDiffPanes(panes: DiffPreviewPane[]) {
  const options = resolveDiffCollapseOptions()
  if (!options || panes.length < 1 || panes.length > 2)
    return panes
  if (panes.length === 2 && panes[0].lines.length !== panes[1].lines.length)
    return panes

  const original = panes[0].lines
  const modified = panes[1]?.lines
  let sourceLineCount = original.length
  while (
    sourceLineCount > 0
    && panes.every(pane => pane.lines[sourceLineCount - 1].kind === 'metadata')
  ) {
    sourceLineCount--
  }
  const isUnchangedRow = (lineIndex: number) => original[lineIndex].kind === 'context'
    && (
      modified === undefined
      || (
        modified[lineIndex].kind === 'context'
        && original[lineIndex].code === modified[lineIndex].code
      )
    )
  const collapsedRanges: Array<{ start: number, end: number }> = []
  let index = 0
  while (index < sourceLineCount) {
    const start = index
    while (index < sourceLineCount && isUnchangedRow(index)) {
      index++
    }
    const end = index
    const runLength = end - start
    if (runLength >= options.minimumLineCount) {
      const hiddenStart = start + (start === 0 ? 0 : options.contextLineCount)
      const isTerminalRange = end === sourceLineCount
      const hiddenEnd = end - (isTerminalRange ? 0 : options.contextLineCount)
      if (hiddenEnd - hiddenStart >= options.minimumLineCount) {
        collapsedRanges.push({
          start: hiddenStart,
          end: isTerminalRange ? original.length : hiddenEnd,
        })
      }
    }
    if (index === start)
      index++
  }

  if (!collapsedRanges.length)
    return panes

  return panes.map((pane, paneIndex) => {
    const lines: DiffPreviewLine[] = []
    let sourceIndex = 0
    for (const range of collapsedRanges) {
      lines.push(...pane.lines.slice(sourceIndex, range.start))
      lines.push({
        code: paneIndex === 0 ? 'Unmodified lines' : '',
        kind: 'collapsed',
        empty: false,
        key: `${pane.key}-collapsed-${range.start}-${range.end}`,
        number: '',
      })
      sourceIndex = range.end
    }
    lines.push(...pane.lines.slice(sourceIndex))
    return { ...pane, lines }
  })
}

const diffPreviewPanes = computed(() => {
  if (!isDiffPreview.value)
    return []

  const hasPatchDiffLines = hasPatchLines(codeLines.value)
  const hasSourcePair = hasDiffSourcePair()
  if (isInlineDiffPreview.value) {
    const lines = hasSourcePair
      ? appendInlineSourceMetadata(
          buildInlineSourcePreviewLines(props.node?.originalCode, props.node?.updatedCode),
          props.node?.originalCode,
          props.node?.updatedCode,
        )
      : buildInlinePatchPreviewLines(codeLines.value)

    return collapseDiffPanes([
      {
        key: 'inline',
        className: 'markstream-pre__diff-pane--inline',
        lines,
      },
    ])
  }

  if (!hasPatchDiffLines && hasSourcePair) {
    return buildSideBySideSourcePreviewPanes(
      props.node?.originalCode,
      props.node?.updatedCode,
    )
  }

  const original = [] as Array<{ code: string, kind: DiffPreviewLineKind, metadataKind?: 'context' | 'removed' | 'added', empty: boolean }>
  const modified = [] as Array<{ code: string, kind: DiffPreviewLineKind, metadataKind?: 'context' | 'removed' | 'added', empty: boolean }>
  const hasHeaders = hasUnifiedDiffHeaders(codeLines.value)
  let previousKind: 'context' | 'removed' | 'added' = 'context'

  for (const raw of codeLines.value) {
    if (raw === NO_NEWLINE_METADATA) {
      if (previousKind === 'removed') {
        original.push(createMetadataLine('original-patch-no-newline', 'removed'))
        modified.push(toDiffPreviewLine('', 'spacer'))
      }
      else if (previousKind === 'added') {
        original.push(toDiffPreviewLine('', 'spacer'))
        modified.push(createMetadataLine('modified-patch-no-newline', 'added'))
      }
      else {
        original.push(createMetadataLine('original-patch-no-newline', 'context'))
        modified.push(createMetadataLine('modified-patch-no-newline', 'context'))
      }
    }
    else if (raw.startsWith('@@')) {
      original.push(toDiffPreviewLine(raw, 'hunk'))
      modified.push(toDiffPreviewLine(raw, 'hunk'))
      previousKind = 'context'
    }
    else if (raw.startsWith('-') && !raw.startsWith('---')) {
      original.push(toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'removed', { preserveBlankKind: true }))
      previousKind = 'removed'
    }
    else if (raw.startsWith('+') && !raw.startsWith('+++')) {
      modified.push(toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'added', { preserveBlankKind: true }))
      previousKind = 'added'
    }
    else {
      const code = hasHeaders && raw.startsWith(' ') ? raw.slice(1) : raw
      original.push(toDiffPreviewLine(code))
      modified.push(toDiffPreviewLine(code))
      previousKind = 'context'
    }
  }

  return collapseDiffPanes([
    {
      key: 'original',
      className: 'markstream-pre__diff-pane--original',
      lines: original.map((line, index) => ({
        ...line,
        key: `original-${index}`,
        number: line.kind === 'metadata' || line.kind === 'spacer' ? '' : index + 1,
      })),
    },
    {
      key: 'modified',
      className: 'markstream-pre__diff-pane--modified',
      lines: modified.map((line, index) => ({
        ...line,
        key: `modified-${index}`,
        number: line.kind === 'metadata' || line.kind === 'spacer' ? '' : index + 1,
      })),
    },
  ])
})

const lineNumberLayoutStyle = computed(() => {
  if (props.showLineNumbers !== true)
    return undefined

  let maximumLineNumber = isDiffPreview.value ? 1 : codeLineCount.value
  if (isDiffPreview.value) {
    maximumLineNumber = Math.max(
      maximumLineNumber,
      splitDiffSource(props.node?.originalCode).length,
      splitDiffSource(props.node?.updatedCode).length,
    )
    for (const pane of diffPreviewPanes.value) {
      for (const line of pane.lines) {
        if (typeof line.number === 'number')
          maximumLineNumber = Math.max(maximumLineNumber, line.number)
      }
    }
  }

  const width = `${Math.max(2, String(maximumLineNumber).length)}ch`
  return {
    '--markstream-pre-line-number-width': width,
    '--markstream-pre-diff-line-number-width': width,
    '--markstream-code-padding-left': 'calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch))',
  }
})

const hasCollapsedDiffPreview = computed(() => {
  return diffPreviewPanes.value.some(pane => pane.lines.some(line => line.kind === 'collapsed'))
})

const ariaLabel = computed(() => {
  const lang = normalizedLanguage.value
  return lang ? `Code block: ${lang}` : 'Code block'
})

// ─── Diff row-height sync ────────────────────────────────────────────────────
// Keeps the left and right diff panes in vertical lockstep when content wraps.
// We measure each pane's natural line heights via DOM, then apply a shared
// `min-height` so that line N on both sides always starts at the same Y.

const preRef = ref<HTMLPreElement | null>(null)

interface DiffLineMetric {
  rowHeight: number
  originalHeight: number
  modifiedHeight: number
}

const diffLineMetrics = ref<DiffLineMetric[]>([])
let diffLineMetricsRaf: number | null = null
let disposed = false
let diffResizeObserver: ResizeObserver | null = null

function readPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function readBaseDiffLineHeight(root: HTMLElement) {
  const style = window.getComputedStyle(root)
  const fromVar = readPx(style.getPropertyValue('--markstream-pre-diff-line-height'))
  if (fromVar > 0)
    return fromVar

  const fromLineHeight = readPx(style.lineHeight)
  return fromLineHeight > 0 ? fromLineHeight : 18
}

function readNaturalDiffLineHeight(line: HTMLElement | null, baseLineHeight: number) {
  if (!line)
    return baseLineHeight

  if (line.classList.contains('markstream-pre__diff-line--collapsed'))
    return 32

  const content = line.querySelector('.markstream-pre__diff-content') as HTMLElement | null
  const contentRect = content?.getBoundingClientRect()
  const contentHeight = contentRect?.height ?? 0

  return Math.max(baseLineHeight, Math.ceil(contentHeight))
}

function areDiffMetricsEqual(a: DiffLineMetric[], b: DiffLineMetric[]) {
  if (a.length !== b.length)
    return false

  return a.every((item, index) => {
    const other = b[index]
    return other
      && Math.abs(item.rowHeight - other.rowHeight) <= 0.5
      && Math.abs(item.originalHeight - other.originalHeight) <= 0.5
      && Math.abs(item.modifiedHeight - other.modifiedHeight) <= 0.5
  })
}

function syncDiffLineMetrics() {
  diffLineMetricsRaf = null

  const root = preRef.value
  if (
    !root
    || !isDiffPreview.value
    || !wrapsDiffPreviewLines.value
  ) {
    if (diffLineMetrics.value.length)
      diffLineMetrics.value = []
    return
  }

  const baseLineHeight = readBaseDiffLineHeight(root)

  const originalSelector = isInlineDiffPreview.value
    ? '.markstream-pre__diff-pane--inline .markstream-pre__diff-line'
    : '.markstream-pre__diff-pane--original .markstream-pre__diff-line'
  const originalLines = Array.from(root.querySelectorAll<HTMLElement>(originalSelector))
  const modifiedLines = Array.from(
    root.querySelectorAll<HTMLElement>('.markstream-pre__diff-pane--modified .markstream-pre__diff-line'),
  )

  const count = Math.max(originalLines.length, modifiedLines.length)
  const next: DiffLineMetric[] = []

  for (let i = 0; i < count; i++) {
    const originalHeight = readNaturalDiffLineHeight(originalLines[i] ?? null, baseLineHeight)
    const modifiedHeight = isInlineDiffPreview.value
      ? originalHeight
      : readNaturalDiffLineHeight(modifiedLines[i] ?? null, baseLineHeight)
    const rowHeight = Math.max(baseLineHeight, originalHeight, modifiedHeight)

    next.push({ rowHeight, originalHeight, modifiedHeight })
  }

  if (!areDiffMetricsEqual(diffLineMetrics.value, next))
    diffLineMetrics.value = next
}

function scheduleDiffLineMetricsSync() {
  if (disposed || typeof window === 'undefined')
    return

  if (diffLineMetricsRaf != null)
    window.cancelAnimationFrame(diffLineMetricsRaf)

  diffLineMetricsRaf = window.requestAnimationFrame(() => {
    diffLineMetricsRaf = null
    if (disposed)
      return
    syncDiffLineMetrics()
  })
}

function setupDiffResizeObserver(el: HTMLElement | null) {
  diffResizeObserver?.disconnect()
  diffResizeObserver = null

  if (
    !el
    || !isDiffPreview.value
    || typeof ResizeObserver === 'undefined'
  ) {
    return
  }

  diffResizeObserver = new ResizeObserver(() => {
    scheduleDiffLineMetricsSync()
  })
  diffResizeObserver.observe(el)
}

watch(
  preRef,
  (el) => {
    setupDiffResizeObserver(el)
    syncDiffLineMetrics()
  },
  { flush: 'post' },
)

watch(
  [isDiffPreview, isInlineDiffPreview, diffPreviewPanes, wrapsDiffPreviewLines],
  () => {
    setupDiffResizeObserver(preRef.value)
    syncDiffLineMetrics()
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  disposed = true
  if (diffLineMetricsRaf != null) {
    window.cancelAnimationFrame(diffLineMetricsRaf)
    diffLineMetricsRaf = null
  }

  diffResizeObserver?.disconnect()
  diffResizeObserver = null
})

function getDiffLineStyle(index: number, side: 'original' | 'modified') {
  if (!wrapsDiffPreviewLines.value)
    return undefined

  const metric = diffLineMetrics.value[index]
  if (!metric)
    return undefined

  const contentHeight = side === 'original' ? metric.originalHeight : metric.modifiedHeight

  return {
    '--markstream-pre-diff-synced-row-height': `${Math.ceil(metric.rowHeight)}px`,
    '--markstream-pre-diff-content-height': `${Math.ceil(contentHeight)}px`,
  }
}
</script>

<template>
  <pre
    ref="preRef"
    :style="[reservedHeightStyle, lineNumberLayoutStyle]"
    :class="[languageClass, { 'markstream-pre--line-numbers': props.showLineNumbers, 'markstream-pre--diff-preview': isDiffPreview, 'markstream-pre--diff-inline': isInlineDiffPreview, 'markstream-pre--diff-collapsed': hasCollapsedDiffPreview }]"
    :aria-busy="isLoading"
    :aria-label="ariaLabel"
    :data-language="normalizedLanguage"
    :data-markstream-line-numbers="props.showLineNumbers ? '1' : undefined"
    data-markstream-pre="1"
    tabindex="0"
  ><code v-if="isDiffPreview" translate="no" class="markstream-pre__diff-code"><span v-for="pane in diffPreviewPanes" :key="pane.key" class="markstream-pre__diff-pane" :class="pane.className"><span class="markstream-pre__diff-pane-content"><span v-for="(line, index) in pane.lines" :key="line.key" class="markstream-pre__diff-line" :class="[`markstream-pre__diff-line--${line.kind}`, line.metadataKind ? `markstream-pre__diff-line--metadata-${line.metadataKind}` : '', { 'markstream-pre__diff-line--empty': line.empty }]" :style="getDiffLineStyle(index, pane.key as 'original' | 'modified')"><span class="markstream-pre__diff-rail" aria-hidden="true" /><span class="markstream-pre__diff-number" aria-hidden="true">{{ line.number }}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{{ line.code }}</span></span></span></span></span></code><template v-else><code v-if="wrapsPlainCodeLines()" translate="no" class="markstream-pre__code markstream-pre__code--wrapped"><span v-for="(line, index) in logicalCodeLines" :key="index" class="markstream-pre__logical-line" :data-line-number="index + 1" v-text="line" /></code><template v-else><span v-if="props.showLineNumbers" class="markstream-pre__line-numbers" aria-hidden="true"><span class="markstream-pre__line-numbers-text" v-text="lineNumbersText" /></span><code translate="no" class="markstream-pre__code" v-text="displayCode" /></template></template></pre>
</template>

<style>
/* Minimal, safe defaults to reduce flicker during frequent text updates */
.markstream-vue pre[class^='language-'],
.markstream-vue pre[class*=' language-'] {
  /* Ensure code layout is stable */
  white-space: pre;
  overflow: auto;
  tab-size: var(--markstream-code-tab-size, 4);
  font-variant-ligatures: none;
  /* Isolate painting/layout to this block to avoid ancestor reflow jank */
  contain: content;
  /* Hint GPU compositing on WebKit/Blink to reduce paint flashing */
  backface-visibility: hidden;
  transform: translateZ(0);
  -webkit-font-smoothing: antialiased;
}
.markstream-vue pre[class^='language-'] > code,
.markstream-vue pre[class*=' language-'] > code {
  display: block;
}

.markstream-vue pre[data-markstream-pre='1']:not(.markstream-pre--diff-preview) {
  background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--code-bg)));
  color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--code-fg)));
}

.markstream-vue pre.markstream-pre--line-numbers {
  position: relative;
}

.markstream-vue pre.code-pre-fallback[data-markstream-code-loading='1'] {
  --markstream-pre-line-number-top: var(--markstream-code-padding-y, 8px);
  --markstream-pre-line-number-left: 0px;
  --markstream-pre-line-number-width: 2ch;
  --markstream-pre-line-number-padding-left: 2ch;
  --markstream-pre-line-number-padding-right: 1ch;
  --markstream-pre-line-number-separator-width: 2px;
  --markstream-code-padding-left: calc(2ch + 2ch + 1ch + 2px + 1ch);
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: var(--markstream-code-padding-y, 8px) var(--markstream-code-padding-x, 1ch);
  padding-left: var(--markstream-code-padding-left);
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--code-bg)));
  color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--code-fg)));
  font-family: var(--markstream-code-font-family, \"SF Mono\", Monaco, Consolas, \"Ubuntu Mono\", \"Liberation Mono\", \"Courier New\", monospace);
  font-size: var(--vscode-editor-font-size, 12px);
  line-height: var(--vscode-editor-line-height, 18px);
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers {
  position: absolute;
  top: var(--markstream-pre-line-number-top, 0);
  left: var(--markstream-pre-line-number-left, 0);
  box-sizing: content-box;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: var(--markstream-pre-line-number-width, 2ch);
  min-width: var(--markstream-pre-line-number-width, 2ch);
  padding-left: var(--markstream-pre-line-number-padding-left, 2ch);
  padding-right: var(--markstream-pre-line-number-padding-right, 1ch);
  border-right: var(--markstream-pre-line-number-separator-width, 2px) solid transparent;
  color: var(--code-line-number);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  pointer-events: none;
  user-select: none;
}

.markstream-vue pre.markstream-pre--line-numbers:not(.markstream-pre--diff-preview):not(.code-pre-fallback) > .markstream-pre__code {
  box-sizing: border-box;
  min-width: 100%;
  padding-left: var(--markstream-code-padding-left, 52px);
  padding-right: var(--markstream-code-padding-x, 12px);
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__code--wrapped {
  white-space: pre-wrap;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__code--wrapped > .markstream-pre__logical-line {
  position: relative;
  display: block;
  min-height: 1lh;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__code--wrapped > .markstream-pre__logical-line::before {
  position: absolute;
  left: calc(-1 * var(--markstream-code-padding-left, 52px));
  box-sizing: content-box;
  width: var(--markstream-pre-line-number-width, 2ch);
  padding-left: var(--markstream-pre-line-number-padding-left, 2ch);
  color: var(--code-line-number);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  text-align: right;
  white-space: pre;
  content: attr(data-line-number);
  pointer-events: none;
  user-select: none;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers > .markstream-pre__line-number {
  display: block;
  min-height: 1lh;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers > .markstream-pre__line-numbers-text {
  display: block;
  min-height: 1lh;
  text-align: right;
  white-space: pre;
}

.markstream-vue pre.markstream-pre--diff-preview {
  box-sizing: border-box;
  padding-left: 0;
  padding-right: 0;
  width: 100%;

  --markstream-pre-diff-gutter-marker-width: 4px;
  --markstream-pre-diff-gutter-gap: 1ch;
  --markstream-pre-diff-code-gap: 1ch;
  --markstream-pre-diff-code-padding: 0px;
  --markstream-diff-added-fg: var(--diff-added-fg, #2f8f68);
  --markstream-diff-removed-fg: var(--diff-removed-fg, #c24141);
  --markstream-diff-added-line-fill: var(--diff-added-bg, rgb(47 143 104 / 12%));
  --markstream-diff-removed-line-fill: var(--diff-removed-bg, rgb(194 65 65 / 12%));
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 var(--markstream-pre-diff-gutter-marker-width),
    transparent var(--markstream-pre-diff-gutter-marker-width) 100%
  );
  --markstream-diff-removed-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-removed-fg) 0 var(--markstream-pre-diff-gutter-marker-width),
    transparent var(--markstream-pre-diff-gutter-marker-width) 100%
  );
  --markstream-pre-diff-line-number-width: 2ch;
  --markstream-pre-diff-line-number-padding-left: 2ch;
  --markstream-pre-diff-line-number-padding-right: 1ch;
  --markstream-pre-diff-line-number-separator-width: 2px;
  --markstream-pre-diff-pane-min-width: 225px;
  --markstream-pre-diff-line-number-box-width: calc(
    var(--markstream-pre-diff-line-number-padding-left)
    + var(--markstream-pre-diff-line-number-width)
    + var(--markstream-pre-diff-line-number-padding-right)
    + var(--markstream-pre-diff-line-number-separator-width)
  );
  --markstream-pre-diff-line-number-bg: var(--markstream-diff-line-number-bg, transparent);
  --markstream-pre-diff-line-number-gap-to-code: var(--markstream-pre-diff-code-gap);
  --markstream-pre-diff-line-number-left: 0px;
  --markstream-pre-diff-line-number-align: var(--markstream-diff-line-number-align, right);
  --markstream-pre-diff-code-fill-left: calc(
    var(--markstream-pre-diff-line-number-left)
    + var(--markstream-pre-diff-line-number-box-width)
  );
  --markstream-pre-diff-code-left: calc(
    var(--markstream-pre-diff-code-fill-left)
    + var(--markstream-pre-diff-line-number-gap-to-code)
    + var(--markstream-pre-diff-code-padding)
  );
}

.markstream-vue pre.markstream-pre--diff-preview::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.markstream-vue pre.code-pre-fallback.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) {
  scrollbar-width: none;
}

.markstream-vue pre.code-pre-fallback.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap)::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline {
  --markstream-pre-diff-line-number-gap-to-code: var(--markstream-pre-diff-code-gap);
  --markstream-pre-diff-line-number-left: 0px;
}

.markstream-vue pre.markstream-pre--diff-preview > .markstream-pre__diff-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  font: inherit;
  line-height: inherit;
  min-width: 100%;
  width: 100%;
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap > .markstream-pre__diff-code {
  grid-template-columns: minmax(var(--markstream-pre-diff-pane-min-width, 225px), 1fr) minmax(var(--markstream-pre-diff-pane-min-width, 225px), 1fr);
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline > .markstream-pre__diff-code {
  grid-template-columns: minmax(0, 1fr);
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) > .markstream-pre__diff-code {
  grid-template-columns: minmax(100%, max-content);
  width: 100%;
  min-width: max-content;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane {
  min-width: 0;
  overflow: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane {
  overflow-x: auto;
  overflow-y: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane-content {
  display: block;
  min-width: 100%;
}

.markstream-vue pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane-content {
  width: max-content;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) .markstream-pre__diff-pane {
  min-width: max-content;
  width: 100%;
  overflow: visible;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane--modified {
  --markstream-pre-diff-pane-divider-width: 1px;
  --markstream-pre-diff-line-number-gap-to-code: var(--markstream-pre-diff-code-gap);
  --markstream-pre-diff-line-number-left: 0px;
  box-shadow: inset 1px 0 var(--markstream-diff-pane-divider, hsl(var(--ms-border)));
}

.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--modified {
  --markstream-pre-diff-line-number-left: calc(
    0px
    + var(--markstream-pre-diff-pane-divider-width)
  );
}

.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--modified .markstream-pre__diff-rail {
  left: var(--markstream-pre-diff-pane-divider-width);
}

.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--modified .markstream-pre__diff-line {
  padding-left: calc(
    var(--markstream-pre-diff-code-left)
    + var(--markstream-pre-diff-pane-divider-width)
  );
}

.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--modified .markstream-pre__diff-line::before {
  left: calc(
    var(--markstream-pre-diff-code-fill-left)
    + var(--markstream-pre-diff-pane-divider-width)
  );
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-pane--modified {
  box-shadow: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  min-height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  padding-left: var(--markstream-pre-diff-code-left);
  line-height: var(--markstream-pre-diff-line-height, 18px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::before {
  content: '';
  position: absolute;
  left: var(--markstream-pre-diff-code-fill-left);
  right: 0;
  top: 0;
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  z-index: 0;
  pointer-events: none;
  border-radius: 0;
  background: transparent;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::after {
  content: '';
  position: absolute;
  left: var(--markstream-pre-diff-line-number-left);
  top: 0;
  width: var(--markstream-pre-diff-line-number-box-width);
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  z-index: 0;
  pointer-events: none;
  background: var(--markstream-pre-diff-line-number-bg);
  box-shadow: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-rail {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  width: var(--markstream-pre-diff-gutter-marker-width, 4px);
  min-width: var(--markstream-pre-diff-gutter-marker-width, 4px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-number {
  position: absolute;
  z-index: 1;
  top: 0;
  left: var(--markstream-pre-diff-line-number-left);
  width: var(--markstream-pre-diff-line-number-width);
  min-width: var(--markstream-pre-diff-line-number-width);
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  box-sizing: content-box;
  background: var(--markstream-pre-diff-line-number-bg);
  box-shadow: none;
  padding-left: var(--markstream-pre-diff-line-number-padding-left, 2ch);
  padding-right: var(--markstream-pre-diff-line-number-padding-right, 1ch);
  border-right: var(--markstream-pre-diff-line-number-separator-width, 2px) solid var(--code-bg);
  color: var(--code-line-number);
  font-variant-numeric: tabular-nums;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  text-align: var(--markstream-pre-diff-line-number-align, right);
  user-select: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-number {
  background: var(--markstream-diff-added-number-fill, var(--markstream-diff-added-line-fill, transparent));
  color: var(--markstream-diff-added-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-number {
  background: var(--markstream-diff-removed-number-fill, var(--markstream-diff-removed-line-fill, transparent));
  color: var(--markstream-diff-removed-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content {
  position: relative;
  z-index: 1;
  display: block;
  width: max-content;
  min-width: 100%;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  white-space: inherit;
  overflow-wrap: normal;
  word-break: normal;
  line-break: auto;
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap .markstream-pre__diff-content {
  box-sizing: border-box;
  width: auto;
  min-width: 0;
  padding-right: 1ch;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content-inner {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  line-break: inherit;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk {
  color: var(--markstream-diff-unchanged-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk::before {
  background: var(--markstream-diff-unchanged-bg, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer::before {
  background-image: linear-gradient(
    -45deg,
    color-mix(in srgb, currentColor 20%, transparent) 12.5%,
    transparent 12.5%,
    transparent 50%,
    color-mix(in srgb, currentColor 20%, transparent) 50%,
    color-mix(in srgb, currentColor 20%, transparent) 62.5%,
    transparent 62.5%,
    transparent 100%
  );
  background-size: 10px 10px;
  opacity: 0.38;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata {
  color: var(--markstream-diff-metadata-fg, var(--code-line-number));
  background: var(--markstream-diff-metadata-bg, var(--code-bg));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata::after,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata > .markstream-pre__diff-rail,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata > .markstream-pre__diff-number {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-line--metadata + .markstream-pre__diff-line--metadata {
  margin-top: calc(-1 * var(--markstream-pre-diff-line-height, 18px));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer::after,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer > .markstream-pre__diff-rail,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer > .markstream-pre__diff-number,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer > .markstream-pre__diff-content {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-collapsed:not(.code-pre-fallback) {
  height: auto !important;
  min-height: 0 !important;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed {
  min-height: var(--markstream-pre-diff-collapsed-row-height, 32px);
  padding-left: 0;
  color: var(--markstream-diff-unchanged-fg, var(--code-line-number));
  line-height: var(--markstream-pre-diff-collapsed-row-height, 32px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed::before {
  left: 0;
  height: var(--markstream-pre-diff-collapsed-row-height, 32px);
  background: var(--markstream-diff-unchanged-bg, rgb(0 0 0 / 4%));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed::after,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-rail,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-number {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-content {
  width: 100%;
  min-width: 0;
  padding-left: calc(var(--markstream-pre-diff-code-left) + 12px);
  line-height: var(--markstream-pre-diff-collapsed-row-height, 32px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added::before {
  background: var(--markstream-diff-added-line-fill, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed::before {
  background: var(--markstream-diff-removed-line-fill, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-rail {
  background: var(--markstream-diff-added-gutter, currentColor);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-rail {
  background: var(--markstream-diff-removed-gutter, currentColor);
}

/* Keyboard accessibility: visible focus when scroll container is focused */
.markstream-vue pre[class^='language-']:focus,
.markstream-vue pre[class*=' language-']:focus {
  outline: var(--ms-focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--ms-focus-ring-offset);
}
</style>
