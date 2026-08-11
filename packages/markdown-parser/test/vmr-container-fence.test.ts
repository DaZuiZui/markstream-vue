import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('vmr_container fallback', () => {
  it('preserves args after container name as attrs', () => {
    const md = getMarkdown('vmr_container_args')
    const markdown = [
      ':::test 1944565882923520000;tag;2',
      ':::',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('test')
    expect(nodes[0]?.attrs?.args).toBe('1944565882923520000;tag;2')
  })

  it('parses fenced code blocks inside ::: containers', () => {
    const md = getMarkdown('vmr_container_fence')
    const markdown = [
      '::: viewcode:topo-test-001 {"devId":"f318206374eb4ac7a3fb3b4b042fd01d"}',
      '```ts',
      'console.log("hello")',
      '```',
      ':::',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:topo-test-001')
    expect(nodes[0]?.attrs?.devId).toBe('f318206374eb4ac7a3fb3b4b042fd01d')

    const children = nodes[0]?.children as any[]
    expect(Array.isArray(children)).toBe(true)

    const code = children.find(n => n?.type === 'code_block')
    expect(code).toBeDefined()
    expect(code.language).toBe('ts')
    expect(String(code.code ?? '')).toContain('console.log')
  })

  it('parses plain text inside ::: containers', () => {
    const md = getMarkdown('vmr_container_text')
    const cases = ['::: viewcode:plain-text', ':::viewcode:plain-text']

    for (const openLine of cases) {
      const markdown = [
        openLine,
        'just some plain text',
        ':::',
      ].join('\n')
      const nodes = parseMarkdownToStructure(markdown, md) as any[]
      expect(nodes[0]?.type).toBe('vmr_container')
      expect(nodes[0]?.name).toBe('viewcode:plain-text')
      const children = nodes[0]?.children as any[]
      expect(children.length).toBe(1)
      expect(children[0]?.type).toBe('paragraph')
      expect(String(children[0]?.children?.[0]?.content ?? '')).toContain('plain text')
    }
  })

  it('parses multiple blocks inside ::: containers', () => {
    const md = getMarkdown('vmr_container_blocks')
    const markdown = [
      '::: viewcode:multi-block',
      'First paragraph.',
      '',
      '```js',
      'alert(123)',
      '```',
      '',
      '- list item',
      ':::',
    ].join('\n')
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    // debug output

    console.log('multi-block AST:', JSON.stringify(nodes, null, 2))
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:multi-block')
    const children = nodes[0]?.children as any[]
    expect(children.some(n => n.type === 'paragraph')).toBe(true)
    expect(children.some(n => n.type === 'code_block')).toBe(true)
    expect(children.some(n => n.type === 'list')).toBe(true)
  })

  it('parses empty or whitespace-only containers', () => {
    const md = getMarkdown('vmr_container_empty')
    const markdown = [
      '::: viewcode:empty',
      '   ',
      ':::',
    ].join('\n')
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:empty')
    expect(Array.isArray(nodes[0]?.children)).toBe(true)
    expect(nodes[0]?.children.length).toBe(0)
  })

  it('parses empty or whitespace-only containers -1', () => {
    const md = getMarkdown('vmr_container_empty')
    const markdown = [
      ':::viewcode:empty',
      '   ',
      ':::',
    ].join('\n')
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:empty')
    expect(Array.isArray(nodes[0]?.children)).toBe(true)
    expect(nodes[0]?.children.length).toBe(0)
  })

  it('keeps content immediately above ::: as a separate node', () => {
    const md = getMarkdown('vmr_container_adjacent_above')
    const cases = ['::: viewcode:plain-text', ':::viewcode:plain-text']

    for (const openLine of cases) {
      const markdown = [
        'Above text',
        openLine,
        'Inside text',
        ':::',
      ].join('\n')

      const nodes = parseMarkdownToStructure(markdown, md) as any[]
      expect(nodes[0]?.type).toBe('paragraph')
      expect(String(nodes[0]?.children?.[0]?.content ?? '')).toContain('Above text')

      expect(nodes[1]?.type).toBe('vmr_container')
      expect(nodes[1]?.name).toBe('viewcode:plain-text')

      const children = nodes[1]?.children as any[]
      expect(children.length).toBe(1)
      expect(children[0]?.type).toBe('paragraph')
      expect(String(children[0]?.children?.[0]?.content ?? '')).toContain('Inside text')
    }
  })

  it('preserves complex JSON attrs (nested object/array)', () => {
    const md = getMarkdown('vmr_container_complex_attrs')
    const markdown = [
      '::: viewcode:complex {"devId":"abc","meta":{"foo":1,"bar":{"baz":[1,2,{"x":3}]}},"arr":[1,"2",{"k":true}]}',
      'Inside',
      ':::',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:complex')
    expect(nodes[0]?.attrs?.devId).toBe('abc')
    expect(nodes[0]?.attrs?.meta).toMatchInlineSnapshot(`
      {
        "bar": {
          "baz": [
            1,
            2,
            {
              "x": 3,
            },
          ],
        },
        "foo": 1,
      }
    `)
    expect(nodes[0]?.attrs?.arr).toMatchInlineSnapshot(`
      [
        1,
        "2",
        {
          "k": true,
        },
      ]
    `)
  })

  it('emits loading=true when ::: container is not closed (streaming mid-state)', () => {
    const md = getMarkdown('vmr_container_loading_mid')
    const markdown = [
      '::: viewcode:stream',
      'partial line',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:stream')
    expect(nodes[0]?.loading).toBe(true)
  })

  it('sets loading=false once closing ::: is present', () => {
    const md = getMarkdown('vmr_container_loading_closed')
    const markdown = [
      '::: viewcode:stream',
      'content',
      ':::',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.loading).toBe(false)
  })

  it('keeps an unclosed container current across streaming appends', () => {
    const md = getMarkdown('vmr_container_loading_progressive')
    const chunks = ['::: viewcode:stream\n', 'con', 'tent\n', ':', ':', ':']
    let markdown = ''

    for (const [index, chunk] of chunks.entries()) {
      markdown += chunk
      const nodes = parseMarkdownToStructure(markdown, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any) as any[]
      const container = nodes[0]

      expect(container?.type).toBe('vmr_container')
      expect(container?.loading).toBe(index < chunks.length - 1)
      if (index >= 1)
        expect(container?.raw).toContain(index === 1 ? 'con' : 'content')
    }

    const nodes = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any) as any[]
    expect(nodes[0]?.children?.[0]?.raw).toBe('content')
  })

  it('forces loading=false when final=true even if closing ::: is missing', () => {
    const md = getMarkdown('vmr_container_loading_final')
    const markdown = [
      '::: viewcode:stream',
      'content',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.loading).toBe(false)
  })

  it('parses attrs args payload in streaming mid-state (no closing :::)', () => {
    const md = getMarkdown('vmr_container_attrs_args_payload')
    const markdown = [
      '::: viewcode:stream xxx;yyy;ddd',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:stream')
    expect(nodes[0]?.attrs?.args).toBe('xxx;yyy;ddd')
    expect(nodes[0]?.loading).toBe(true)
  })

  it('parses loose attrs payload in streaming mid-state (no closing :::)', () => {
    const md = getMarkdown('vmr_container_attrs_loose_object')
    const markdown = [
      '::: viewcode:stream {xxx:yyy}',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:stream')
    expect(nodes[0]?.attrs?.xxx).toBe('yyy')
    expect(nodes[0]?.loading).toBe(true)
  })

  it('downgrades incomplete attrs payload to args in streaming mid-state attr', () => {
    const md = getMarkdown('vmr_container_attrs_loose_object')
    const markdown = [
      '::: viewcode:stream {xxx:yyy',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:stream')
    expect(nodes[0]?.attrs?.args).toBe('{xxx:yyy')
    expect(nodes[0]?.loading).toBe(true)
  })
})
