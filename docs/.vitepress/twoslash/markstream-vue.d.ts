import type { DefineComponent } from 'vue'
import type { BaseNode } from 'stream-markdown-parser'
import type {
  CodeBlockDiffHunkActionContext,
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
} from '../../../src/exports'
import type { NodeRendererProps as SourceNodeRendererProps } from '../../../src/types/node-renderer-props'

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

export interface NodeRendererProps extends SourceNodeRendererProps {
  codeBlockOptions?: CodeBlockOptions
}

export type {
  BaseNode,
  CodeBlockDiffHunkActionContext,
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
}

export {
  D2BlockNode,
  ImageNode,
  MermaidBlockNode,
  PreCodeNode,
  createKaTeXWorkerFromCDN,
  createMermaidWorkerFromCDN,
  enableD2,
  enableKatex,
  enableMermaid,
  getRegisteredThemes,
  getMarkdown,
  parseMarkdownToStructure,
  preloadCodeBlockRuntime,
  preloadExtendedLanguageIcons,
  registerIconTheme,
  removeCustomComponents,
  setCustomComponents,
  setD2Loader,
  setDefaultI18nMap,
  setDefaultMathOptions,
  setIconTheme,
  setKaTeXWorker,
  setKatexLoader,
  setLanguageIconResolver,
  setMermaidLoader,
  setMermaidWorker,
  VueRendererMarkdown,
} from '../../../src/exports'

export declare const CodeBlockNode: DefineComponent<CodeBlockNodeProps & { codeBlockOptions?: CodeBlockOptions }>
export declare const MarkdownRender: DefineComponent<NodeRendererProps>

export default MarkdownRender
