import type MarkdownIt from 'markdown-it'
import { full as emojiPlugin } from 'markdown-it-emoji'

function emojiConfigurer(md: MarkdownIt): MarkdownIt {
  md.use(emojiPlugin)
  return md
}

/**
 * Some node components only trigger when the consumer registers an optional
 * markdown-it plugin. The docs site opts in for preview purposes where the
 * plugin is available in the workspace.
 */
export function optionalMarkdownIt(slug: string): ((md: MarkdownIt) => MarkdownIt) | undefined {
  if (slug === 'emoji-node')
    return emojiConfigurer
  return undefined
}

/**
 * Cards whose snippet cannot live-render because the required markdown-it
 * plugin is not installed in this repository (e.g. markdown-it-deflist).
 * They fall back to showing the raw markdown as code.
 */
export function needsCodeFallback(slug: string): boolean {
  return slug === 'definition-list-node'
}
