import type { ComponentType, PropsWithChildren, ReactNode } from 'react'
import type { BaseNode } from 'stream-markdown-parser'

export type CodeBlockTheme = string

export type RenderNodeFn = (node: BaseNode, key: string | number, ctx: RenderContext) => ReactNode

export interface RenderContext {
  customId?: string
  isDark?: boolean
  final?: boolean
}

export interface NodeComponentProps<TNode = unknown> {
  node: TNode
  ctx?: RenderContext
  renderNode?: RenderNodeFn
  indexKey?: string | number
  customId?: string
  isDark?: boolean
  typewriter?: boolean
  fade?: boolean
  children?: ReactNode
}

export type StreamingComponent<TNode = any> = ComponentType<NodeComponentProps<TNode>>
export type StreamingComponentMap = Record<string, StreamingComponent<any>>
export type HtmlComponent<P extends object = any> = ComponentType<PropsWithChildren<P>>
export type HtmlComponentMap = Record<string, HtmlComponent<any>>

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

export interface NodeRendererProps {
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

export declare const MarkdownRender: ComponentType<NodeRendererProps>
export declare const NodeRenderer: ComponentType<NodeRendererProps>
export declare function defineStreamingComponents<const T extends Record<string, ComponentType<any>>>(components: T): T
export declare function defineHtmlComponents<const T extends Record<string, ComponentType<any>>>(components: T): T
export declare function setMermaidWorker(worker: Worker): void
export declare function setKaTeXWorker(worker: Worker): void
export declare function enableMermaid(): void
export declare function enableKatex(): void
export declare function setCustomComponents(...args: unknown[]): void

export default MarkdownRender
