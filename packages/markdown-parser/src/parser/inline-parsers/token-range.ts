import type { MarkdownToken } from '../../types'

export function collectDelimitedInlineTokens(
  tokens: MarkdownToken[],
  startIndex: number,
  closeType: string,
  openType?: string,
  useTextFallback = false,
) {
  let content = ''
  let index = startIndex + 1
  let openCount = 1
  const innerTokens: MarkdownToken[] = []

  while (index < tokens.length) {
    if (tokens[index].type === closeType) {
      if (openCount === 1)
        break
      openCount--
    }
    if (openType && tokens[index].type === openType)
      openCount++

    const tokenText = tokens[index] as MarkdownToken & { text?: unknown }
    content += useTextFallback
      ? String(tokens[index].content ?? tokenText.text ?? '')
      : String(tokens[index].content ?? '')
    innerTokens.push(tokens[index])
    index++
  }

  return {
    content,
    innerTokens,
    nextIndex: index < tokens.length ? index + 1 : tokens.length,
  }
}
