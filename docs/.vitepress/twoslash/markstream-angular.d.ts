import type { BaseNode } from 'stream-markdown-parser'

export type CodeBlockTheme = string

export interface CodeBlockThemePair {
  dark: string
  light: string
}

export interface CodeBlockOptions {
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  maxHeight?: number
  padding?: number
  tabSize?: number
  disableLineNumbers?: boolean
  overflow?: 'scroll' | 'wrap'
  diffStyle?: 'unified' | 'split'
  expandUnchanged?: boolean
  collapsedContextThreshold?: number
  hunkSeparators?: 'simple' | 'metadata' | 'line-info' | 'line-info-basic'
  lineDiffType?: 'word-alt' | 'word' | 'char' | 'none'
  parseDiffOptions?: Record<string, unknown>
  enableLineSelection?: boolean
  lineAnnotations?: unknown[]
  onController?: (controller: unknown) => void
  workerManager?: unknown
}

export interface MarkstreamAngularComponentProps {
  content?: string
  nodes?: BaseNode[]
  final?: boolean
  fade?: boolean
  isDark?: boolean
  mermaidProps?: Record<string, unknown>
  codeBlockOptions?: CodeBlockOptions
  codeBlockProps?: Record<string, unknown>
  [key: string]: unknown
}

export declare const MarkstreamAngularComponent: unknown
export declare const MarkdownRenderComponent: unknown
export declare function setMermaidWorker(worker: Worker): void
export declare function setKaTeXWorker(worker: Worker): void
export declare function enableMermaid(): void
export declare function enableKatex(): void

export default MarkstreamAngularComponent
