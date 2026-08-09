import type { MarkdownToken, ParsedNode, ParseOptions } from '../src'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { getMarkdown, parseInlineTokens } from '../src'

type PublicParseInlineTokens = (
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: ParseOptions,
) => ParsedNode[]

function token(type: string, content = '', extra: Partial<MarkdownToken> = {}): MarkdownToken {
  return { type, content, ...extra } as MarkdownToken
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return
  for (const child of Object.values(value))
    deepFreeze(child)
  Object.freeze(value)
}

describe('parseInlineTokens dispatcher characterization', () => {
  it('keeps the exact public four-argument helper signature', () => {
    expectTypeOf(parseInlineTokens).toEqualTypeOf<PublicParseInlineTokens>()
  })

  it('preserves nested strong, link, code, and math order before a sentinel token', () => {
    const nodes = parseInlineTokens([
      token('strong_open', '', { tag: 'strong', markup: '**' }),
      token('link_open', '', { tag: 'a', attrs: [['href', 'https://example.com']] }),
      token('code_inline', 'x', { markup: '`' }),
      token('text', ' + '),
      token('math_inline', 'y', { markup: '$' }),
      token('link_close', '', { tag: 'a' }),
      token('strong_close', '', { tag: 'strong', markup: '**' }),
      token('text', ' sentinel'),
    ], undefined, undefined, { final: false })

    expect(nodes).toMatchObject([
      {
        type: 'strong',
        raw: '**x + y**',
        children: [{
          type: 'link',
          href: 'https://example.com',
          loading: false,
          children: [
            { type: 'inline_code', code: 'x', raw: 'x' },
            { type: 'text', content: ' + ', raw: ' + ' },
            { type: 'math_inline', content: 'y', loading: false, markup: '$' },
          ],
        }],
      },
      { type: 'text', content: ' sentinel', raw: ' sentinel' },
    ])
  })

  it.each([
    {
      name: 'inline code',
      tokens: [token('code_inline', 'a\\b', { markup: '`' })],
      expected: { type: 'inline_code', code: 'a\\b', raw: 'a\\b' },
    },
    {
      name: 'image',
      tokens: [token('image', '', {
        attrs: [['src', 'https://example.com/a.png'], ['alt', 'alt']],
        children: [token('text', 'alt')],
      })],
      expected: { type: 'image', src: 'https://example.com/a.png', alt: 'alt', loading: false },
    },
    {
      name: 'numeric reference',
      tokens: [token('reference', '1', { markup: '[1]' })],
      expected: { type: 'reference', id: '1', raw: '[1]' },
    },
  ])('advances once after $name and preserves the following sentinel', ({ tokens, expected }) => {
    const nodes = parseInlineTokens([...tokens, token('text', ' sentinel')], undefined, undefined, { final: false })

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject(expected)
    expect(nodes[1]).toMatchObject({ type: 'text', content: ' sentinel', raw: ' sentinel' })
  })

  it.each([
    ['\\*literal\\* sentinel', '*literal* sentinel'],
    ['\\[1\\] sentinel', '[1] sentinel'],
    ['\\$x\\$ sentinel', '$x$ sentinel'],
  ])('keeps escaped inline markers literal for raw source %s', (raw, content) => {
    const nodes = parseInlineTokens([
      token('text', content, { markup: raw.slice(0, 2) }),
    ], raw, undefined, { final: true })

    expect(nodes).toMatchObject([{ type: 'text', content, raw: content }])
  })

  it('preserves outer-image and malformed-tail raw/content/loading semantics', () => {
    const md = getMarkdown('inline-dispatcher-characterization')
    const source = '[![alt](https://img/x.png)](https://example.com'
    const inline = md.parseInline(source, { __markstreamFinal: false }) as unknown as MarkdownToken[]
    const children = inline[0]?.children ?? []
    const nodes = parseInlineTokens(children, source, undefined, { final: false })

    expect(nodes).toMatchObject([{
      type: 'link',
      href: 'https://example.com',
      text: 'alt',
      raw: '[alt](https://example.com)',
      loading: true,
      children: [{
        type: 'image',
        src: 'https://img/x.png',
        alt: 'alt',
        raw: 'alt',
        loading: false,
      }],
    }])
  })

  it.each([
    {
      name: 'loading image tail',
      raw: '![alt](https://images.example/a.png) sentinel',
      tokens: [
        token('text', '![alt]('),
        token('link', '', {
          href: 'https://images.example/a.png',
          text: 'https://images.example/a.png',
          title: null,
          loading: true,
        } as Partial<MarkdownToken>),
        token('text', ') sentinel'),
      ],
      expected: { type: 'image', src: 'https://images.example/a.png', alt: 'alt', loading: true },
    },
    {
      name: 'markdown link tail',
      raw: '[label](https://example.com) sentinel',
      tokens: [
        token('text', '[label]('),
        token('link_open', '', { attrs: [['href', 'https://example.com']], markup: 'linkify' }),
        token('text', 'https://example.com'),
        token('link_close', '', { markup: 'linkify' }),
        token('text', ') sentinel'),
      ],
      expected: { type: 'link', href: 'https://example.com', text: 'label', loading: false },
    },
  ])('copy-on-write preserves frozen input tokens for $name', ({ expected, raw, tokens }) => {
    const before = JSON.stringify(tokens)
    deepFreeze(tokens)

    const nodes = parseInlineTokens(tokens, raw, undefined, { final: false })

    expect(JSON.stringify(tokens)).toBe(before)
    expect(nodes[0]).toMatchObject(expected)
    expect(nodes.filter(node => node.type === 'text' && node.content === ' sentinel')).toHaveLength(1)
  })

  it('uses the third argument for list-item checkbox context without skipping the sentinel', () => {
    const nodes = parseInlineTokens(
      [token('text', '[x]'), token('text', ' sentinel')],
      '[x] sentinel',
      token('list_item_open'),
      { final: false },
    )

    expect(nodes).toMatchObject([
      { type: 'checkbox_input', checked: true, raw: '[x]' },
      { type: 'text', content: ' sentinel', raw: ' sentinel' },
    ])
  })

  it('keeps the initial strong-closing mode when link validation mutates options', () => {
    const options = {
      requireClosingStrong: false,
      validateLink(this: ParseOptions) {
        this.requireClosingStrong = true
        return true
      },
    } satisfies ParseOptions
    const nodes = parseInlineTokens([
      token('link_open', '', { attrs: [['href', 'https://first.test']] }),
      token('text', 'first'),
      token('link_close'),
      token('text', ' *[second](https://second.test)* sentinel'),
    ], undefined, undefined, options)

    expect(nodes).toMatchObject([
      { type: 'link', href: 'https://first.test', text: 'first' },
      { type: 'text', content: ' ', raw: ' ' },
      {
        type: 'emphasis',
        children: [{ type: 'link', href: 'https://second.test', text: 'second' }],
      },
      { type: 'text', content: '* sentinel', raw: '* sentinel' },
    ])
  })
})
