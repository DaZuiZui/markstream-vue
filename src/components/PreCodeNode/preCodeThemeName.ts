import type { CodeBlockTheme, CodeBlockThemeProp } from '../../types/component-props'

export interface PreCodeThemeInput {
  isDark?: boolean
  theme?: CodeBlockThemeProp
  darkTheme?: CodeBlockTheme
  lightTheme?: CodeBlockTheme
  themes?: readonly CodeBlockTheme[]
}

export function resolvePreCodeThemeName(input: PreCodeThemeInput): string {
  const theme = input.theme
  if (theme !== undefined)
    return typeof theme === 'string' ? theme : theme[input.isDark ? 'dark' : 'light']
  return (input.isDark ? input.darkTheme ?? input.themes?.[0] : input.lightTheme ?? input.themes?.[1])
    ?? (input.isDark ? 'vitesse-dark' : 'vitesse-light')
}

export function preCodeThemeLooksDark(themeName: string, isDark = false) {
  const name = themeName.toLowerCase()
  if (/light/.test(name))
    return false
  return /dark|dracula/.test(name) || isDark
}
