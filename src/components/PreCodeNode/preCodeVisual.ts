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
  builtin: boolean
  dark: boolean
  diffAddedLine: string
  diffAddedNumber: string
  diffRemovedLine: string
  diffRemovedNumber: string
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

export function preCodeThemeLooksDark(themeName: string, isDark = false) {
  const normalized = themeName.toLowerCase()
  if (!normalized)
    return isDark
  const darkTokens = [
    'dark',
    'night',
    'moon',
    'black',
    'dracula',
    'mocha',
    'frappe',
    'macchiato',
    'palenight',
    'ocean',
    'poimandres',
    'monokai',
    'laserwave',
    'tokyo',
    'slack-dark',
    'rose-pine',
    'github-dark',
    'material-theme',
    'one-dark',
    'catppuccin-mocha',
    'catppuccin-frappe',
    'catppuccin-macchiato',
  ]
  const lightTokens = ['light', 'latte', 'dawn', 'lotus']
  if (lightTokens.some(token => normalized.includes(token)))
    return false
  if (darkTokens.some(token => normalized.includes(token)))
    return true
  return isDark
}

export function resolvePreCodeThemePalette(input: PreCodeThemeInput): PreCodeThemePalette {
  const name = resolvePreCodeThemeName(input)
  const dark = name === 'vitesse-dark'
    || (name !== 'vitesse-light' && preCodeThemeLooksDark(name, input.isDark === true))

  if (name !== 'vitesse-dark' && name !== 'vitesse-light') {
    const background = dark
      ? 'var(--markstream-code-theme-bg, #121212)'
      : 'var(--markstream-code-theme-bg, #ffffff)'
    const foreground = dark
      ? 'var(--markstream-code-theme-fg, #dbd7caee)'
      : 'var(--markstream-code-theme-fg, #393a34)'
    const lineNumber = dark
      ? 'var(--markstream-code-theme-line-number, #dedcd550)'
      : 'var(--markstream-code-theme-line-number, #393a3450)'
    return {
      builtin: false,
      dark,
      name,
      background,
      diffAddedLine: `color-mix(in lab, ${background} ${dark ? '80%' : '88%'}, ${dark ? '#4d9375' : '#1e754f'})`,
      diffAddedNumber: `color-mix(in lab, ${background} ${dark ? '85%' : '91%'}, ${dark ? '#4d9375' : '#1e754f'})`,
      diffRemovedLine: `color-mix(in lab, ${background} ${dark ? '80%' : '88%'}, ${dark ? '#cb7676' : '#ab5959'})`,
      diffRemovedNumber: `color-mix(in lab, ${background} ${dark ? '85%' : '91%'}, ${dark ? '#cb7676' : '#ab5959'})`,
      foreground,
      lineNumber,
    }
  }

  return dark
    ? {
        builtin: true,
        dark: true,
        name,
        background: '#121212',
        diffAddedLine: 'color-mix(in lab, #121212 80%, #4d9375)',
        diffAddedNumber: 'color-mix(in lab, #121212 85%, #4d9375)',
        diffRemovedLine: 'color-mix(in lab, #121212 80%, #cb7676)',
        diffRemovedNumber: 'color-mix(in lab, #121212 85%, #cb7676)',
        foreground: '#dbd7caee',
        lineNumber: '#dedcd550',
      }
    : {
        builtin: true,
        dark: false,
        name,
        background: '#ffffff',
        diffAddedLine: 'color-mix(in lab, #ffffff 88%, #1e754f)',
        diffAddedNumber: 'color-mix(in lab, #ffffff 91%, #1e754f)',
        diffRemovedLine: 'color-mix(in lab, #ffffff 88%, #ab5959)',
        diffRemovedNumber: 'color-mix(in lab, #ffffff 91%, #ab5959)',
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
