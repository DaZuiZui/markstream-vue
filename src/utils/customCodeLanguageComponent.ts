import { normalizeShikiLanguage } from 'markstream-core'
import { normalizeLanguageIdentifier } from './languageIcon'

export function getCustomCodeLanguageComponent<T>(
  customComponents: Readonly<Partial<Record<string, T>>>,
  language: string,
) {
  const raw = language.trim().toLowerCase()
  if (!raw)
    return undefined

  for (const key of [
    raw,
    normalizeLanguageIdentifier(raw),
    normalizeShikiLanguage(raw),
    raw === 'd2lang' ? 'd2' : '',
  ]) {
    const component = key && customComponents[key]
    if (component)
      return component
  }

  return undefined
}
