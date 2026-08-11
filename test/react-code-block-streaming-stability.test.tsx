/**
 * @vitest-environment jsdom
 */

import React, { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'
import { NodeRenderer as ServerNodeRenderer } from '../packages/markstream-react/src/server'

const scopeId = 'react-code-block-streaming-stability'

let mountCount = 0
let unmountCount = 0
let instanceSequence = 0

function CodeBlockProbe(props: any) {
  const instanceIdRef = useRef(++instanceSequence)

  useEffect(() => {
    mountCount++
    return () => {
      unmountCount++
    }
  }, [])

  return (
    <div
      className="code-block-probe"
      data-instance-id={String(instanceIdRef.current)}
      data-code={String(props.node?.code ?? '')}
      data-langs={JSON.stringify(props.langs ?? null)}
      data-show-header={String(props.showHeader)}
      data-stream={String(props.stream)}
      data-index-key={String(props.indexKey ?? '')}
      data-has-ctx={String(Boolean(props.ctx && typeof props.ctx === 'object'))}
      data-has-render-node={String(typeof props.renderNode === 'function')}
    />
  )
}

function PreviewCodeProbe(props: any) {
  useEffect(() => {
    props.onPreviewCode?.({
      type: 'text/html',
      content: '<div>preview</div>',
      title: 'HTML Preview',
    })
  }, [props.onPreviewCode])

  return <div className="preview-code-probe" />
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  removeCustomComponents(scopeId)
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  mountCount = 0
  unmountCount = 0
  instanceSequence = 0
})

describe('markstream-react code block streaming stability', () => {
  it('keeps the same code_block instance while streamed content grows', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    setCustomComponents(scopeId, { code_block: CodeBlockProbe as any })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderNodes = (code: string) =>
      React.createElement(NodeRenderer as any, {
        customId: scopeId,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code,
            raw: `\`\`\`ts\n${code}`,
            loading: true,
          },
        ],
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      })

    await act(async () => {
      root.render(renderNodes('export const a = 1'))
    })
    await flushReact()

    const initialProbe = host.querySelector('.code-block-probe') as HTMLElement | null
    const initialInstanceId = initialProbe?.getAttribute('data-instance-id')

    expect(initialProbe).toBeTruthy()
    expect(initialProbe?.getAttribute('data-code')).toBe('export const a = 1')
    expect(mountCount).toBe(1)
    expect(unmountCount).toBe(0)

    await act(async () => {
      root.render(renderNodes('export const a = 1\nexport const b = 2'))
    })
    await flushReact()

    const updatedProbe = host.querySelector('.code-block-probe') as HTMLElement | null
    expect(updatedProbe).toBeTruthy()
    expect(updatedProbe?.getAttribute('data-instance-id')).toBe(initialInstanceId)
    expect(updatedProbe?.getAttribute('data-code')).toBe('export const a = 1\nexport const b = 2')
    expect(mountCount).toBe(1)
    expect(unmountCount).toBe(0)

    await act(async () => {
      root.unmount()
    })
  })

  it('ignores removed top-level langs and lets codeBlockProps supply them to custom code_block renderers', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    setCustomComponents(scopeId, { code_block: CodeBlockProbe as any })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(NodeRenderer as any, {
        customId: scopeId,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const a = 1',
            raw: '```ts\nexport const a = 1\n```',
          },
        ],
        langs: ['typescript'],
        codeBlockProps: {
          langs: ['python'],
        },
        codeBlockStream: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      }))
    })
    await flushReact()

    const probe = host.querySelector('.code-block-probe') as HTMLElement | null
    expect(probe?.getAttribute('data-langs')).toBe('["python"]')
    expect(probe?.getAttribute('data-stream')).toBe('false')

    await act(async () => {
      root.unmount()
    })
  })

  it('forwards custom code block preview to onHandleArtifactClick', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const onHandleArtifactClick = vi.fn()
    setCustomComponents(scopeId, { code_block: PreviewCodeProbe as any })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(NodeRenderer as any, {
        customId: scopeId,
        nodes: [
          {
            type: 'code_block',
            language: 'html',
            code: '<div>preview</div>',
            raw: '```html\n<div>preview</div>\n```',
          },
        ],
        onHandleArtifactClick,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      }))
    })
    await flushReact()

    expect(onHandleArtifactClick).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: 'text/html',
      artifactTitle: 'HTML Preview',
      node: expect.objectContaining({
        code: '<div>preview</div>',
      }),
    }))

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps generic code block props off custom mermaid renderers on client and server', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    setCustomComponents(scopeId, { mermaid: CodeBlockProbe as any })

    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'flowchart TD\nA-->B',
      raw: '```mermaid\nflowchart TD\nA-->B\n```',
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(NodeRenderer as any, {
        customId: scopeId,
        nodes: [node],
        langs: ['mermaid'],
        codeBlockStream: false,
        codeBlockProps: {
          showHeader: true,
        },
        mermaidProps: {
          showHeader: false,
        },
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      }))
    })
    await flushReact()

    const probe = host.querySelector('.code-block-probe') as HTMLElement | null
    expect(probe?.getAttribute('data-langs')).toBe('null')
    expect(probe?.getAttribute('data-show-header')).toBe('false')
    expect(probe?.getAttribute('data-stream')).toBe('undefined')

    const html = renderToStaticMarkup(React.createElement(ServerNodeRenderer as any, {
      customId: scopeId,
      nodes: [node],
      langs: ['mermaid'],
      codeBlockStream: false,
      codeBlockProps: {
        showHeader: true,
      },
      mermaidProps: {
        showHeader: false,
      },
    }))

    expect(html).toContain('data-langs="null"')
    expect(html).toContain('data-show-header="false"')
    expect(html).toContain('data-stream="undefined"')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not let codeBlockProps override custom code_block structural props', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    setCustomComponents(scopeId, { code_block: CodeBlockProbe as any })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(NodeRenderer as any, {
        customId: scopeId,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const real = 1',
            raw: '```ts\nexport const real = 1\n```',
          },
        ],
        codeBlockProps: {
          node: {
            type: 'code_block',
            language: 'python',
            code: 'wrong = True',
            raw: '```python\nwrong = True\n```',
          },
          ctx: { unsafe: true },
          renderNode: null,
          indexKey: 'wrong-index',
          ref: 'wrong-ref',
          ['__proto__']: { unsafe: true },
          prototype: { unsafe: true },
          constructor: { unsafe: true },
          langs: ['python'],
        },
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      }))
    })
    await flushReact()

    const probe = host.querySelector('.code-block-probe') as HTMLElement | null
    expect(probe?.getAttribute('data-code')).toBe('export const real = 1')
    expect(probe?.getAttribute('data-langs')).toBe('["python"]')
    expect(probe?.getAttribute('data-index-key')).not.toBe('wrong-index')
    expect(probe?.getAttribute('data-has-ctx')).toBe('true')
    expect(probe?.getAttribute('data-has-render-node')).toBe('true')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not let codeBlockProps override server custom code_block structural props', () => {
    setCustomComponents(scopeId, { code_block: CodeBlockProbe as any })

    const html = renderToStaticMarkup(React.createElement(ServerNodeRenderer as any, {
      customId: scopeId,
      nodes: [
        {
          type: 'code_block',
          language: 'ts',
          code: 'export const real = 1',
          raw: '```ts\nexport const real = 1\n```',
        },
      ],
      codeBlockProps: {
        node: {
          type: 'code_block',
          language: 'python',
          code: 'wrong = True',
          raw: '```python\nwrong = True\n```',
        },
        ctx: { unsafe: true },
        renderNode: null,
        indexKey: 'wrong-index',
        ref: 'wrong-ref',
        ['__proto__']: { unsafe: true },
        prototype: { unsafe: true },
        constructor: { unsafe: true },
        langs: ['python'],
      },
    }))

    expect(html).toContain('data-code="export const real = 1"')
    expect(html).toContain('data-langs="[&quot;python&quot;]"')
    expect(html).not.toContain('wrong-index')
    expect(html).toContain('data-has-ctx="true"')
    expect(html).toContain('data-has-render-node="true"')
  })
})
