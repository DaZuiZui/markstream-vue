export { isCodeBlockRuntimeReady } from '../components/CodeBlockNode/runtime'
export { getRegisteredThemes, registerIconTheme, setIconTheme } from '../icon-themes'
export type { IconTheme } from '../icon-themes'
export * from './katex-threshold'
export * from './languageIcon'
export * from './nodeLifecycle'
export * from './performance-monitor'
export * from './safeRaf'
export * from 'stream-markdown-parser'

export async function preloadCodeBlockRuntime() {
  const { preloadCodeBlockRuntime } = await import('../components/CodeBlockNode/streamDiffs')
  return preloadCodeBlockRuntime()
}
