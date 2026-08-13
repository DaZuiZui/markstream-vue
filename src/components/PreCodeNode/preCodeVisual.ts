import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemeProp } from '../../types/component-props'

export const DEFAULT_PRE_CODE_FONT_SIZE = 12
export const DEFAULT_PRE_CODE_LINE_HEIGHT = 18
export const DEFAULT_PRE_CODE_FONT_FAMILY = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'
export const DEFAULT_PRE_CODE_PADDING = 8
export const DEFAULT_PRE_CODE_TAB_SIZE = 4
export const DEFAULT_PRE_CODE_MAX_HEIGHT = 500
export const DEFAULT_PRE_CODE_SCROLLBAR_GUTTER = 6

interface PreCodeThemeInput {
  isDark?: boolean
  theme?: CodeBlockThemeProp
  darkTheme?: CodeBlockTheme
  lightTheme?: CodeBlockTheme
  themes?: readonly CodeBlockTheme[]
}

interface PreCodeThemePalette {
  background: string
  foreground: string
  lineNumber: string
  name: string
}

export interface ResolvedPreCodeVisualOptions {
  fontFamily: string
  fontSize: number
  lineHeight: number
  maxHeight: number
  overflow: 'scroll' | 'wrap'
  padding: number
  paddingBottom: number
  scrollbarGutter: number
  tabSize: number
}

function isThemePair(theme: CodeBlockThemeProp | undefined): theme is { dark: string, light: string } {
  return !!theme && typeof theme === 'object' && 'dark' in theme && 'light' in theme
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

export function resolvePreCodeThemeName(input: PreCodeThemeInput): string {
  if (input.theme !== undefined)
    return isThemePair(input.theme) ? (input.isDark ? input.theme.dark : input.theme.light) : input.theme

  const explicitTheme = input.isDark ? input.darkTheme : input.lightTheme
  if (explicitTheme)
    return explicitTheme

  const configuredTheme = input.isDark ? input.themes?.[0] : input.themes?.[1]
  if (configuredTheme)
    return configuredTheme

  return input.isDark ? 'vitesse-dark' : 'vitesse-light'
}

function themeNameLooksDark(themeName: string, isDark: boolean) {
  const normalized = themeName.toLowerCase()
  if (normalized.includes('light') || normalized.includes('latte') || normalized.includes('dawn') || normalized.includes('lotus'))
    return false
  if (normalized.includes('dark') || normalized.includes('night') || normalized.includes('moon') || normalized.includes('black'))
    return true
  return isDark
}

export function resolvePreCodeThemePalette(input: PreCodeThemeInput): PreCodeThemePalette {
  const name = resolvePreCodeThemeName(input)
  const dark = name === 'vitesse-dark'
    || (name !== 'vitesse-light' && themeNameLooksDark(name, input.isDark === true))

  return dark
    ? {
        name,
        background: '#121212',
        foreground: '#dbd7caee',
        lineNumber: '#dedcd550',
      }
    : {
        name,
        background: '#ffffff',
        foreground: '#393a34',
        lineNumber: '#393a3450',
      }
}

export function resolvePreCodeVisualOptions(
  options: CodeBlockOptions | undefined,
): ResolvedPreCodeVisualOptions {
  const fontSize = positiveNumber(options?.fontSize) ?? DEFAULT_PRE_CODE_FONT_SIZE
  const lineHeight = positiveNumber(options?.lineHeight)
    ?? (fontSize === DEFAULT_PRE_CODE_FONT_SIZE
      ? DEFAULT_PRE_CODE_LINE_HEIGHT
      : Math.max(12, Math.round(fontSize * 1.5)))
  const fontFamily = typeof options?.fontFamily === 'string' && options.fontFamily.trim()
    ? options.fontFamily.trim()
    : DEFAULT_PRE_CODE_FONT_FAMILY
  const padding = nonNegativeNumber(options?.padding) ?? DEFAULT_PRE_CODE_PADDING

  return {
    fontFamily,
    fontSize,
    lineHeight,
    maxHeight: positiveNumber(options?.maxHeight) ?? DEFAULT_PRE_CODE_MAX_HEIGHT,
    overflow: options?.overflow ?? 'wrap',
    // stream-diffs exposes the same visual bottom spacing as padding plus its
    // transparent horizontal scrollbar track. Keep the pre's visible spacing
    // equal to that combined surface, rather than subtracting the track here.
    padding,
    paddingBottom: padding,
    scrollbarGutter: DEFAULT_PRE_CODE_SCROLLBAR_GUTTER,
    tabSize: positiveNumber(options?.tabSize) ?? DEFAULT_PRE_CODE_TAB_SIZE,
  }
}
