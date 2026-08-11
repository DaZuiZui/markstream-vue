import { ESCAPABLE_PUNCTUATION } from './literal-text-helpers'

const WHITESPACE_RE = /\s/u
const ASCII_PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/
const UNICODE_PUNCTUATION_RE = /\p{P}/u
const CJK_OPENING_PUNCTUATION_RE = /^[\x22\x27《「『【〔〖〘〚〈（［｛“‘﹁﹃﹙﹛﹝]$/u
const CJK_CLOSING_PUNCTUATION_RE = /^[\x22\x27》」』】〕〗〙〛〉）］｝”’﹂﹄﹚﹜﹞]$/u

export function countUnescapedAsterisks(str: string): number {
  let count = 0
  let i = 0
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length && str[i + 1] === '*') {
      i += 2 // skip escaped asterisk
      continue
    }
    if (str[i] === '*')
      count++
    i++
  }
  return count
}

export function findNextUnescapedAsterisk(rawContent: string | undefined, startContentIndex = 0): number {
  if (!rawContent)
    return -1

  let contentIndex = 0

  for (let rawIndex = 0; rawIndex < rawContent.length; rawIndex++) {
    const char = rawContent[rawIndex]
    const nextChar = rawContent[rawIndex + 1]

    if (char === '\\' && nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
      if (nextChar === '*' && contentIndex >= startContentIndex) {
        contentIndex++
        rawIndex++
        continue
      }

      contentIndex++
      rawIndex++
      continue
    }

    if (char === '*' && contentIndex >= startContentIndex)
      return contentIndex

    contentIndex++
  }

  return -1
}

function isWhitespaceChar(ch?: string) {
  return !!ch && WHITESPACE_RE.test(ch)
}

function isPunctuationChar(ch?: string) {
  return !!ch && (ASCII_PUNCTUATION_RE.test(ch) || UNICODE_PUNCTUATION_RE.test(ch))
}

function isCjkOpeningPunctuation(ch?: string, previous?: string) {
  return !!ch
    && !!previous
    && /^\p{Script=Han}$/u.test(previous)
    && CJK_OPENING_PUNCTUATION_RE.test(ch)
}

function isCjkClosingPunctuation(ch?: string, next?: string) {
  return !!ch
    && !!next
    && /^[\p{L}\p{N}]$/u.test(next)
    && CJK_CLOSING_PUNCTUATION_RE.test(ch)
}

export function isEmphasisOpenDelimiter(content: string, index: number) {
  const prev = index > 0 ? content[index - 1] : undefined
  const next = content[index + 1]

  if (!next || isWhitespaceChar(next))
    return false

  return !(isPunctuationChar(next) && !isCjkOpeningPunctuation(next, prev) && !!prev && !isWhitespaceChar(prev) && !isPunctuationChar(prev))
}

function isEmphasisCloseDelimiter(content: string, index: number) {
  const prev = index > 0 ? content[index - 1] : undefined
  const next = content[index + 1]

  if (!prev || isWhitespaceChar(prev))
    return false

  return !(isPunctuationChar(prev) && !isCjkClosingPunctuation(prev, next) && !!next && !isWhitespaceChar(next) && !isPunctuationChar(next))
}

export function findNextUnescapedEmphasisClose(
  rawContent: string | undefined,
  content: string,
  startContentIndex = 0,
) {
  let searchIndex = startContentIndex
  let sawInvalidClose = false

  while (searchIndex < content.length) {
    const closeIndex = rawContent
      ? findNextUnescapedAsterisk(rawContent, searchIndex)
      : content.indexOf('*', searchIndex)

    if (closeIndex === -1)
      break

    if (isEmphasisCloseDelimiter(content, closeIndex))
      return { index: closeIndex, sawInvalidClose }

    sawInvalidClose = true
    searchIndex = closeIndex + 1
  }

  return { index: -1, sawInvalidClose }
}

export function isStrongOpenDelimiter(content: string, index: number) {
  const prev = index > 0 ? content[index - 1] : undefined
  const next = content[index + 2]

  if (!next || isWhitespaceChar(next))
    return false

  return !(isPunctuationChar(next) && !isCjkOpeningPunctuation(next, prev) && !!prev && !isWhitespaceChar(prev) && !isPunctuationChar(prev))
}

function isStrongCloseDelimiter(content: string, index: number) {
  const prev = index > 0 ? content[index - 1] : undefined
  const next = content[index + 2]

  if (!prev || isWhitespaceChar(prev))
    return false

  return !(isPunctuationChar(prev) && !isCjkClosingPunctuation(prev, next) && !!next && !isWhitespaceChar(next) && !isPunctuationChar(next))
}

export function findNextStrongClose(content: string, startContentIndex = 0) {
  let searchIndex = startContentIndex
  let sawInvalidClose = false

  while (searchIndex < content.length) {
    const closeIndex = content.indexOf('**', searchIndex)
    if (closeIndex === -1)
      break

    if (isStrongCloseDelimiter(content, closeIndex))
      return { index: closeIndex, sawInvalidClose }

    sawInvalidClose = true
    searchIndex = closeIndex + 2
  }

  return { index: -1, sawInvalidClose }
}

const WORD_CHAR_RE = /[\p{L}\p{N}]/u
const WORD_ONLY_RE = /^[\p{L}\p{N}]+$/u

export function isWordChar(ch?: string) {
  if (!ch)
    return false
  return WORD_CHAR_RE.test(ch)
}

export function isWordOnly(text: string) {
  if (!text)
    return false
  return WORD_ONLY_RE.test(text)
}

export function getAsteriskRunInfo(content: string, start: number) {
  let end = start
  while (end < content.length && content[end] === '*')
    end++
  const prev = start > 0 ? content[start - 1] : undefined
  const next = end < content.length ? content[end] : undefined
  return {
    len: end - start,
    prev,
    next,
    intraword: isWordChar(prev) && isWordChar(next),
  }
}

export function findLiteralIntrawordAsteriskRunPairEnd(content: string) {
  const runs: Array<{ start: number, end: number }> = []

  for (let index = 0; index < content.length;) {
    if (content[index] !== '*') {
      index++
      continue
    }

    const info = getAsteriskRunInfo(content, index)
    const end = index + info.len
    if (info.len >= 2 && info.intraword)
      runs.push({ start: index, end })
    index = end
  }

  for (let index = 0; index < runs.length - 1; index++) {
    const current = runs[index]
    const next = runs[index + 1]
    const inner = content.slice(current.end, next.start)
    if (!isWordOnly(inner))
      return next.end
  }

  return -1
}

export function isTripleAsteriskInnerText(text: string) {
  return !!text && text.trim() === text && /^[\p{L}\p{N}\s]+$/u.test(text)
}

export function findTripleAsteriskClose(content: string, start: number) {
  let searchIndex = start

  while (searchIndex < content.length) {
    const index = content.indexOf('***', searchIndex)
    if (index === -1)
      return -1

    const info = getAsteriskRunInfo(content, index)
    if (info.len >= 3)
      return index

    searchIndex = index + info.len
  }

  return -1
}
