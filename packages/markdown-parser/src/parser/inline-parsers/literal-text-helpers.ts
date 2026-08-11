import type { MarkdownToken } from '../../types'

export const ESCAPED_PUNCTUATION_RE = /\\([\\()[\]`$|*_\-!])/g
export const ESCAPABLE_PUNCTUATION = new Set(['\\', '(', ')', '[', ']', '`', '$', '|', '*', '_', '-', '!'])
export const INLINE_TEXT_MARKER_BACKSLASH = 1
export const INLINE_TEXT_MARKER_ASTERISK = 2
export const INLINE_TEXT_MARKER_UNDERSCORE = 4
export const INLINE_TEXT_MARKER_TILDE = 8
export const INLINE_TEXT_MARKER_BACKTICK = 16
export const INLINE_TEXT_MARKER_OPEN_BRACKET = 32
export const INLINE_TEXT_MARKER_CLOSE_BRACKET = 64
export const INLINE_TEXT_MARKER_BANG = 128
export const INLINE_TEXT_MARKER_DOLLAR = 256
export const INLINE_TEXT_MARKER_PIPE = 512
export const INLINE_TEXT_MARKER_OPEN_PAREN = 1024
export const INLINE_CANDIDATE_MARKERS = INLINE_TEXT_MARKER_ASTERISK
  | INLINE_TEXT_MARKER_UNDERSCORE
  | INLINE_TEXT_MARKER_TILDE
  | INLINE_TEXT_MARKER_BACKTICK
  | INLINE_TEXT_MARKER_OPEN_BRACKET
  | INLINE_TEXT_MARKER_BANG
  | INLINE_TEXT_MARKER_DOLLAR
  | INLINE_TEXT_MARKER_PIPE
  | INLINE_TEXT_MARKER_OPEN_PAREN

export function getInlineTextMarkerFlags(content: string) {
  let flags = 0
  for (let index = 0; index < content.length; index++) {
    switch (content.charCodeAt(index)) {
      case 33:
        flags |= INLINE_TEXT_MARKER_BANG
        break
      case 36:
        flags |= INLINE_TEXT_MARKER_DOLLAR
        break
      case 40:
        flags |= INLINE_TEXT_MARKER_OPEN_PAREN
        break
      case 42:
        flags |= INLINE_TEXT_MARKER_ASTERISK
        break
      case 91:
        flags |= INLINE_TEXT_MARKER_OPEN_BRACKET
        break
      case 92:
        flags |= INLINE_TEXT_MARKER_BACKSLASH
        break
      case 93:
        flags |= INLINE_TEXT_MARKER_CLOSE_BRACKET
        break
      case 95:
        flags |= INLINE_TEXT_MARKER_UNDERSCORE
        break
      case 96:
        flags |= INLINE_TEXT_MARKER_BACKTICK
        break
      case 124:
        flags |= INLINE_TEXT_MARKER_PIPE
        break
      case 126:
        flags |= INLINE_TEXT_MARKER_TILDE
        break
    }
  }
  return flags
}

export function decodeVisibleTextFromRaw(rawText: string) {
  let output = ''
  let index = 0

  while (index < rawText.length) {
    if (rawText[index] !== '\\') {
      output += rawText[index]
      index++
      continue
    }

    let slashCount = 0
    while (index + slashCount < rawText.length && rawText[index + slashCount] === '\\')
      slashCount++

    const nextChar = rawText[index + slashCount]
    output += '\\'.repeat(Math.floor(slashCount / 2))

    if (slashCount % 2 === 1) {
      if (nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
        output += nextChar
        index += slashCount + 1
        continue
      }

      output += '\\'
    }

    index += slashCount
  }

  return output
}

export function getRawIndexForVisibleIndex(rawText: string, visibleIndex: number) {
  let outputIndex = 0

  for (let rawIndex = 0; rawIndex < rawText.length; rawIndex++) {
    const char = rawText[rawIndex]
    const nextChar = rawText[rawIndex + 1]

    if (char === '\\' && nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
      if (outputIndex === visibleIndex)
        return rawIndex + 1
      outputIndex++
      rawIndex++
      continue
    }

    if (outputIndex === visibleIndex)
      return rawIndex

    outputIndex++
  }

  return -1
}

export function isEscapedVisibleChar(rawText: string, visibleIndex: number, expectedChar?: string) {
  const rawIndex = getRawIndexForVisibleIndex(rawText, visibleIndex)
  if (rawIndex === -1)
    return false
  if (expectedChar && rawText[rawIndex] !== expectedChar)
    return false

  let slashCount = 0
  for (let i = rawIndex - 1; i >= 0 && rawText[i] === '\\'; i--)
    slashCount++

  return slashCount % 2 === 1
}

export function recoverTrailingMarkdownLinkLabel(raw?: string, href?: string) {
  if (!raw || !href)
    return null

  const match = raw.match(/\[([^\]\n]+)\]\(([^)]*)$/)
  if (!match)
    return null

  return match[2] === href ? match[1] : null
}

export function hasEscapedMarkup(token: MarkdownToken, escapedPrefix: string) {
  return String(token.markup ?? '').startsWith(escapedPrefix)
}

export function stripTrailingMidStateMarker(content: string, token: MarkdownToken, markerFlags = getInlineTextMarkerFlags(content)) {
  let nextContent = content
  const rawTokenContent = String(token.content ?? '')

  if ((markerFlags & INLINE_TEXT_MARKER_BACKSLASH) !== 0 && nextContent.endsWith('\\') && !hasEscapedMarkup(token, '\\\\') && !rawTokenContent.endsWith('\\\\'))
    nextContent = nextContent.slice(0, -1)

  if ((markerFlags & INLINE_TEXT_MARKER_OPEN_PAREN) !== 0 && nextContent.endsWith('(') && !hasEscapedMarkup(token, '\\(') && !rawTokenContent.endsWith('\\('))
    nextContent = nextContent.slice(0, -1)

  if ((markerFlags & INLINE_TEXT_MARKER_ASTERISK) !== 0 && /\*+$/.test(nextContent) && !hasEscapedMarkup(token, '\\*') && !rawTokenContent.endsWith('\\*'))
    nextContent = nextContent.replace(/\*+$/, '')

  return nextContent
}
