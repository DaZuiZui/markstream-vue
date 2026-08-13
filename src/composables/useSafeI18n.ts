import type { InjectionKey } from 'vue'
import { getCurrentInstance } from 'vue'

function humanizeKey(key: string) {
  const s = key.split('.').pop() || key
  return s
    .replace(/[_-]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

const defaultMap: Record<string, string> = {
  'common.copy': 'Copy',
  'common.selectCopy': '全选（复制）',
  'common.copied': 'Copied',
  'common.decrease': 'Decrease',
  'common.reset': 'Reset',
  'common.increase': 'Increase',
  'common.expand': 'Expand',
  'common.collapse': 'Collapse',
  'common.preview': 'Preview',
  'common.source': 'Source',
  'common.export': 'Export',
  'common.open': 'Open',
  'common.minimize': 'Minimize',
  'common.zoomIn': 'Zoom in',
  'common.zoomOut': 'Zoom out',
  'common.resetZoom': 'Reset zoom',
  'image.loadError': 'Image failed to load',
  'image.loading': 'Loading image...',

}

export type MarkstreamI18nMap = Partial<Record<string, string>>
export const MARKSTREAM_I18N_FALLBACK_KEY: InjectionKey<MarkstreamI18nMap> = Symbol('markstreamI18nFallback')

/**
 * Replace default fallback translations.
 * Consumers can call this to provide their own fallback translations (e.g. Chinese).
 */
export function setDefaultI18nMap(map: Partial<Record<keyof typeof defaultMap, string>>) {
  Object.assign(defaultMap, map)
}

interface Translator {
  t: (key: string) => string
  te?: (key: string) => boolean
}

function resolveComponentTranslator() {
  try {
    const instance = getCurrentInstance()
    const proxy = instance?.proxy as unknown as Record<string, unknown> | null | undefined
    const proxyT = proxy?.$t
    if (typeof proxyT === 'function') {
      const proxyTe = proxy?.$te
      return {
        t: proxyT.bind(proxy),
        te: typeof proxyTe === 'function' ? proxyTe.bind(proxy) : undefined,
      }
    }

    const globalProperties = instance?.appContext?.config?.globalProperties as Record<string, unknown> | undefined
    const appT = globalProperties?.$t
    if (typeof appT === 'function') {
      const appTe = globalProperties?.$te
      return {
        t: appT.bind(globalProperties),
        te: typeof appTe === 'function' ? appTe.bind(globalProperties) : undefined,
      }
    }
  }
  catch {}
  return null
}

function resolveAppFallbackMap(): MarkstreamI18nMap | null {
  try {
    const instance = getCurrentInstance()
    const key = MARKSTREAM_I18N_FALLBACK_KEY as symbol
    const provides = (instance as unknown as { provides?: Record<symbol, unknown> } | null)?.provides
    const appProvides = instance?.appContext?.provides as Record<symbol, unknown> | undefined
    return (provides?.[key] ?? appProvides?.[key] ?? null) as MarkstreamI18nMap | null
  }
  catch {}
  return null
}

function resolveFallbackValue(key: string, appFallbackMap?: MarkstreamI18nMap | null) {
  return appFallbackMap?.[key] ?? defaultMap[key]
}

const fallbackT = (key: string, appFallbackMap?: MarkstreamI18nMap | null) => resolveFallbackValue(key, appFallbackMap) ?? humanizeKey(key)

function withFallback(translator: Translator, appFallbackMap?: MarkstreamI18nMap | null) {
  return {
    t(key: string) {
      const fallback = resolveFallbackValue(key, appFallbackMap)
      if (translator.te && fallback != null && !translator.te(key))
        return fallbackT(key, appFallbackMap)

      const translated = translator.t(key)
      return translated === key && fallback != null ? fallbackT(key, appFallbackMap) : translated
    },
  }
}

export function useSafeI18n() {
  const appFallbackMap = resolveAppFallbackMap()
  const translator = resolveComponentTranslator()
  if (translator)
    return withFallback(translator, appFallbackMap)

  // Synchronous fallback in case `vue-i18n` is not installed.
  try {
    // Try to use global installed vue-i18n if available synchronously via composition API
    // This will work when the consumer has set up vue-i18n and the bundler left
    // the runtime entry available. We access it via (global) require-ish path.
    // Keep this non-throwing.
    const possible = (globalThis as any).$vueI18nUse || null
    if (possible && typeof possible === 'function') {
      try {
        const i18n = possible()
        if (i18n && typeof i18n.t === 'function') {
          return withFallback({
            t: (i18n.t as any).bind(i18n),
            te: typeof i18n.te === 'function' ? (i18n.te as any).bind(i18n) : undefined,
          }, appFallbackMap)
        }
      }
      catch {}
    }
  }
  catch {}

  return { t: (key: string) => fallbackT(key, appFallbackMap) }
}
