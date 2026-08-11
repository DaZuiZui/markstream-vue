import type { CodeBlockDiffHideUnchangedRegions, CodeBlockDiffHideUnchangedRegionsOptions } from '../../types/component-props'

export const defaultDiffHideUnchangedRegions = Object.freeze({
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 5,
})

export function resolveDiffHideUnchangedRegionsOption(value: unknown): CodeBlockDiffHideUnchangedRegions {
  if (typeof value === 'boolean')
    return value
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>
    return {
      ...defaultDiffHideUnchangedRegions,
      ...raw,
      enabled: raw.enabled ?? true,
    } as CodeBlockDiffHideUnchangedRegionsOptions
  }
  return { ...defaultDiffHideUnchangedRegions }
}

export function resolveDiffInlineLayout(options: Record<string, unknown>) {
  return options.diffStyle === 'unified'
}

export function parseCodeFenceInfo(raw: string) {
  const firstLine = String(raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine.length < 3)
    return ''
  const marker = firstLine[0]
  if ((marker !== '`' && marker !== '~') || firstLine[1] !== marker || firstLine[2] !== marker)
    return ''

  let index = 3
  while (firstLine[index] === marker)
    index += 1

  return firstLine.slice(index).trim()
}

export function isDiffFenceInfo(value: unknown) {
  const firstToken = String(value ?? '').trim().split(/\s+/, 1)[0] ?? ''
  return firstToken === 'diff'
}

export function isDiffCodeBlock(node: { diff?: boolean, language?: unknown, raw?: unknown }) {
  return node.diff === true
    || isDiffFenceInfo(node.language)
    || isDiffFenceInfo(parseCodeFenceInfo(String(node.raw ?? '')))
}

export function extractCodeBlockFileLabel(raw: string) {
  const info = parseCodeFenceInfo(raw)
  if (!info)
    return ''

  const tokens = info.split(/\s+/).filter(Boolean)
  if (!tokens.length)
    return ''

  const candidates = tokens[0] === 'diff' ? tokens.slice(1) : tokens
  for (const token of candidates) {
    const value = token.includes(':')
      ? token.slice(token.indexOf(':') + 1)
      : token
    if (value && /[./\\-]/.test(value))
      return value
  }

  return ''
}

export function resolveCodeBlockHeader(raw: string, displayLanguage: string, isDiff: boolean) {
  const fileLabel = extractCodeBlockFileLabel(raw)
  return {
    title: fileLabel || displayLanguage,
    caption: fileLabel ? (isDiff ? `Diff / ${displayLanguage}` : displayLanguage) : '',
  }
}
