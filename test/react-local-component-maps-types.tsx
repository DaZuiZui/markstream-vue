import type React from 'react'
import type {
  HtmlComponentMap,
  StreamingComponentMap,
} from '../packages/markstream-react/src/customComponents'
import type { NodeRendererProps } from '../packages/markstream-react/src/types'
import type { CodeBlockOptions } from '../packages/markstream-react/src/types/component-props'
import type { NodeComponentProps } from '../packages/markstream-react/src/types/node-component'
import {
  defineHtmlComponents,
  defineStreamingComponents,
} from '../packages/markstream-react/src/customComponents'

interface DocumentLinkNode {
  type: 'documentlink'
  tag: 'documentlink'
  attrs?: [string, string][]
  content: string
  loading?: boolean
}

function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
  return <span>{props.node.content}</span>
}

function TenantDocumentLink(props: NodeComponentProps<DocumentLinkNode> & { tenantId: string }) {
  return <span data-tenant-id={props.tenantId}>{props.node.content}</span>
}

function Badge({ kind, children }: React.PropsWithChildren<{ kind?: string }>) {
  return <span data-kind={kind}>{children}</span>
}

function TreeNode({ node, children }: React.PropsWithChildren<{ node: string }>) {
  return <span data-node={node}>{children}</span>
}

declare function NodeRenderer<
  TStreamingComponents extends StreamingComponentMap = StreamingComponentMap,
  THtmlComponents extends Record<string, any> = HtmlComponentMap,
>(props: NodeRendererProps<TStreamingComponents, THtmlComponents>): React.ReactElement | null

function RequiredLink({ url, children }: React.PropsWithChildren<{ url: string }>) {
  return <a href={url}>{children}</a>
}

const streamingComponents = {
  documentlink: DocumentLink,
} satisfies StreamingComponentMap

const htmlComponents = {
  'badge': Badge,
  'requiredlink': RequiredLink,
  'tree-node': TreeNode,
} satisfies HtmlComponentMap

const definedStreamingComponents = defineStreamingComponents({
  documentlink: DocumentLink,
})

const definedHtmlComponents = defineHtmlComponents({
  'badge': Badge,
  'requiredlink': RequiredLink,
  'tree-node': TreeNode,
})

const codeBlockOptions = {
  onLineClick: (_event: { lineNumber: number }) => {},
  onController: (controller: { dispose(): void }) => controller.dispose(),
} satisfies CodeBlockOptions

defineStreamingComponents({
  // @ts-expect-error streamingComponents require parser-backed NodeComponentProps.
  badge: Badge,
})

defineStreamingComponents({
  // @ts-expect-error streamingComponents cannot require props the renderer never supplies.
  documentlink: TenantDocumentLink,
})

defineHtmlComponents({
  // @ts-expect-error htmlComponents must not require parser-backed props.node.
  documentlink: DocumentLink,
})

const rendererElement = (
  <NodeRenderer
    content="<DocumentLink>typed</DocumentLink>"
    final
    htmlComponents={htmlComponents}
    streamingComponents={streamingComponents}
  />
)

const wrongHtmlRendererElement = (
  <NodeRenderer
    content="<DocumentLink>typed</DocumentLink>"
    final
    htmlComponents={{
      // @ts-expect-error htmlComponents must not receive parser-backed NodeComponentProps.
      documentlink: DocumentLink,
    }}
  />
)

const wrongStreamingRendererElement = (
  <NodeRenderer
    content="<DocumentLink>typed</DocumentLink>"
    final
    streamingComponents={{
      // @ts-expect-error streamingComponents cannot require props the renderer never supplies.
      documentlink: TenantDocumentLink,
    }}
  />
)

void streamingComponents
void htmlComponents
void definedStreamingComponents
void definedHtmlComponents
void codeBlockOptions
void rendererElement
void wrongHtmlRendererElement
void wrongStreamingRendererElement
