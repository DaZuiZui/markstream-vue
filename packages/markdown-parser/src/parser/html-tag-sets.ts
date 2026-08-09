import type { ParseOptions } from '../types'
import { normalizeCustomHtmlTags } from '../customHtmlTags'
import { STANDARD_HTML_TAGS } from '../htmlTags'

export function buildAllowedHtmlTagSet(options?: ParseOptions) {
  const custom = options?.customHtmlTags
  if (!Array.isArray(custom) || custom.length === 0)
    return STANDARD_HTML_TAGS
  const set = new Set<string>(STANDARD_HTML_TAGS)
  for (const name of normalizeCustomHtmlTags(custom)) {
    if (name)
      set.add(name)
  }
  return set
}
