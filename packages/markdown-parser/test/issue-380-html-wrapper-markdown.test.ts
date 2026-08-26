import { describe, expect, it, vi } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const issue588Markdown = `# Metrics

<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">

<div>

## Left

**Scope:** left scope
**Period:** left period

</div>

<div>

## Right

**Scope:** right scope
**Period:** right period

</div>

</div>`

function textContent(node: any): string {
  if (Array.isArray(node))
    return node.map(textContent).join(' ')
  if (!node || typeof node !== 'object')
    return ''

  const own = node.type === 'text' ? String(node.content ?? '') : ''
  const children = Array.isArray(node.children) ? node.children.map(textContent).join(' ') : ''
  const items = Array.isArray(node.items) ? node.items.map(textContent).join(' ') : ''
  return `${own} ${children} ${items}`.trim()
}

function expectIssue588Structure(nodes: any[]) {
  expect(nodes.map(node => node?.type)).toEqual(['heading', 'html_block'])

  const outer = nodes[1]
  expect(outer?.tag).toBe('div')
  expect(outer?.children?.map((child: any) => `${child?.type}:${child?.tag}`)).toEqual([
    'html_block:div',
    'html_block:div',
  ])
  expect(textContent(outer.children[0])).toContain('Left')
  expect(textContent(outer.children[1])).toContain('Right')
  expect(textContent(nodes).match(/Right/g)).toHaveLength(1)
}

describe('issue 380 html wrapper markdown regression', () => {
  it('keeps markdown nested in a span wrapper as structured children without leaking duplicate top-level nodes', () => {
    const markdown = `<span style="font-size: 12px;">  
  
🗺️【环境状态】  
- 地点：石溪村，李东的茅屋
- 时间：4/12 周四 上午07:00
- 环境：阳光明媚，空气清新，茅屋内简陋但整洁，远处山峦笼罩在薄雾中，偶尔传来鸟鸣声
  
📊【角色状态】
- 生理：健康（轻微饥饿）
- 物品：锄头（自家）、简易弓箭（自家）、5个铜币（自家）、一些干粮（自家）
- 技能：农耕（基础）、陷阱设置（基础）、生存知识（基础）
- 关系：与顾客关系良好（+）

📖【目标与线索】
- 已知线索：无
- 短期目标：无
- 长期目标：无
***

  
🎯【选项】  
1. 去田里劳作，争取多收成些粮食卖钱
2. 上山检查之前设置的陷阱，看有没有捕到猎
3. 直接去清风镇看看情况，虽然路途遥远
4. ……

</span>`

    const md = getMarkdown('issue-380-structured')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('span')
    expect(nodes[0]?.attrs).toEqual([['style', 'font-size: 12px;']])
    expect(nodes[0]?.raw).toBe(markdown)
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual([
      'paragraph',
      'list',
      'paragraph',
      'list',
      'paragraph',
      'list',
      'thematic_break',
      'paragraph',
      'list',
    ])
    expect(nodes[0]?.children?.[0]?.children?.[0]?.content).toBe('🗺️【环境状态】')
    expect(nodes[0]?.children?.[1]?.items).toHaveLength(3)
    expect(nodes[0]?.children?.[8]?.ordered).toBe(true)
    expect(nodes[0]?.children?.[8]?.items).toHaveLength(4)
  })

  it('structures simple block markdown inside span and removes leaked list duplicates', () => {
    const markdown = `<span>

- a
- b

</span>`
    const md = getMarkdown('issue-380-simple')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('span')
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['list'])
    expect(nodes[0]?.children?.[0]?.items).toHaveLength(2)
    expect(nodes[0]?.children?.[0]?.items?.[0]?.children?.[0]?.children?.[0]?.content).toBe('a')
    expect(nodes[0]?.children?.[0]?.items?.[1]?.children?.[0]?.children?.[0]?.content).toBe('b')
  })

  it('keeps pure html wrappers unstructured when they do not actually contain markdown blocks', () => {
    const markdown = '<div><strong>Block HTML</strong></div>'
    const md = getMarkdown('issue-380-pure-html')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('div')
    expect(nodes[0]?.children).toBeUndefined()
  })

  it('does not turn indented nested HTML into code blocks while the wrapper streams', () => {
    const html = `<div>
  <h3>Deployment summary</h3>
  <p>This card keeps growing while it streams.</p>
  <ul>
    <li><strong>Region:</strong> cn-east-1</li>
    <li><strong>Instances:</strong> 4 x 2 vCPU</li>
    <li><strong>Status:</strong> healthy</li>
  </ul>
  <table>
    <tr><th>Service</th><th>Version</th><th>Replicas</th></tr>
    <tr><td>gateway</td><td>1.4.2</td><td>2</td></tr>
    <tr><td>api</td><td>2.0.0</td><td>6</td></tr>
    <tr><td>worker</td><td>1.9.7</td><td>8</td></tr>
  </table>
</div>`
    const md = getMarkdown('streaming-pure-html-card')

    for (let end = 20; end <= html.length; end += 20) {
      const nodes = parseMarkdownToStructure(html.slice(0, end), md, { final: false }) as any[]
      const block = nodes.find(node => node?.type === 'html_block')
      expect(block?.children, `stream offset ${end}`).toBeUndefined()
    }
  })

  it('does not recursively parse a large pure-html wrapper', () => {
    const rows = Array.from({ length: 1000 }, (_, index) => `    <li>row ${index}</li>`).join('\n')
    const markdown = `<div>\n  <ul>\n${rows}\n  </ul>\n</div>`
    const md = getMarkdown('large-pure-html-wrapper')
    const blockParse = vi.spyOn(md.block, 'parse')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes[0]?.children).toBeUndefined()
    expect(blockParse).toHaveBeenCalledTimes(1)
  })

  it('still structures an indented code block inside an HTML wrapper', () => {
    const markdown = `<div>
    const value = 1
</div>`
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('html-wrapper-indented-code'), { final: true }) as any[]

    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['code_block'])
    expect(nodes[0]?.children?.[0]?.code).toBe('const value = 1\n')
  })

  it('does not structure blocked tags even when their inner content looks like markdown blocks', () => {
    const markdown = `<script>

- a
- b

</script>`
    const md = getMarkdown('issue-380-blocked-tag')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('script')
    expect(nodes[0]?.children).toBeUndefined()
    expect(nodes[0]?.raw).toBe(markdown)
  })

  it('keeps literal-content tags unstructured even when their inner content looks like markdown blocks', () => {
    const samples = ['pre', 'style', 'textarea'] as const

    for (const tag of samples) {
      const markdown = `<${tag}>

- a
- b

</${tag}>`
      const md = getMarkdown(`issue-380-literal-${tag}`)
      const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('html_block')
      expect(nodes[0]?.tag).toBe(tag)
      expect(nodes[0]?.children).toBeUndefined()
      expect(nodes[0]?.raw).toBe(markdown)
    }
  })

  it('structures nested html wrappers when the inner wrapper already contains markdown blocks', () => {
    const markdown = `<div>
<div>

- a

</div>
</div>`
    const md = getMarkdown('issue-380-nested')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('div')
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['html_block'])
    expect(nodes[0]?.children?.[0]?.tag).toBe('div')
    expect(nodes[0]?.children?.[0]?.children?.map((child: any) => child?.type)).toEqual(['list'])
    expect(nodes[0]?.children?.[0]?.children?.[0]?.items).toHaveLength(1)
    expect(nodes[0]?.children?.[0]?.children?.[0]?.items?.[0]?.children?.[0]?.children?.[0]?.content).toBe('a')
  })

  it('keeps streaming span wrappers stable before the closing tag arrives', () => {
    const markdown = `<span>

- a
- b`
    const md = getMarkdown('issue-380-streaming')
    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('span')
    expect(nodes[0]?.loading).toBe(true)
    expect(nodes[0]?.children?.map((child: any) => child?.type)).toEqual(['list'])
    expect(nodes[0]?.children?.[0]?.items).toHaveLength(2)
  })

  it.each([true, false])('keeps both issue 588 sibling div blocks when final is %s', (final) => {
    const md = getMarkdown(`issue-588-div-${final}`)
    const nodes = parseMarkdownToStructure(issue588Markdown, md, { final }) as any[]

    expectIssue588Structure(nodes)
  })

  it('keeps sibling section blocks inside an html wrapper', () => {
    const markdown = issue588Markdown.replaceAll('<div>', '<section>').replaceAll('</div>', '</section>')
    const md = getMarkdown('issue-588-section')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes.map(node => node?.type)).toEqual(['heading', 'html_block'])
    expect(nodes[1]?.children?.map((child: any) => `${child?.type}:${child?.tag}`)).toEqual([
      'html_block:section',
      'html_block:section',
    ])
    expect(textContent(nodes[1]?.children?.[0])).toContain('Left')
    expect(textContent(nodes[1]?.children?.[1])).toContain('Right')
    expect(textContent(nodes).match(/Right/g)).toHaveLength(1)
  })

  it('does not lose the second sibling while its html block streams in', () => {
    const rightOpen = issue588Markdown.indexOf('<div>', issue588Markdown.indexOf('<div>') + 1) + '<div>'.length
    const rightHeading = issue588Markdown.indexOf('## Right') + '## Right\n\n'.length
    const rightClose = issue588Markdown.indexOf('</div>', rightHeading) + '</div>'.length
    const states = [rightOpen, rightHeading, rightClose, issue588Markdown.length]
    const md = getMarkdown('issue-588-streaming-states')

    for (const [index, end] of states.entries()) {
      const nodes = parseMarkdownToStructure(issue588Markdown.slice(0, end), md, { final: false }) as any[]
      expect(nodes.map(node => node?.type)).toEqual(['heading', 'html_block'])
      expect(nodes[1]?.children?.filter((child: any) => child?.type === 'html_block'), `stream state ${index}`).toHaveLength(2)
      if (index > 0)
        expect(textContent(nodes)).toContain('Right')
    }
  })

  it.each([
    ['comment', '<!-- example <div> -->'],
    ['raw text', '<script>const sample = "<div>"</script>'],
    ['iframe text', '<iframe>example <div></iframe>'],
    ['quoted attribute', '<span data-example="<div>">value</span>'],
  ])('ignores same-tag text inside %s while matching a streaming wrapper close', (name, inner) => {
    const markdown = `<div>
${inner}

## After

</div>`
    const md = getMarkdown(`issue-588-literal-${name}`)
    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.tag).toBe('div')
    expect(nodes[0]?.loading).toBe(false)
    expect(nodes[0]?.raw).toBe(markdown)
    expect(nodes[0]?.content).toBe(markdown)
    expect(textContent(nodes)).toContain('After')
    expect(nodes[0]?.children?.some((child: any) => /^\s*<\/div>\s*$/.test(String(child?.raw ?? '')))).toBe(false)
  })

  it('keeps three levels of mixed html wrappers structured', () => {
    const markdown = `<div>
<section>
<article>

### Deep

</article>
</section>
</div>`
    const md = getMarkdown('issue-588-deep-mixed')
    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.tag).toBe('div')
    expect(nodes[0]?.children?.[0]?.tag).toBe('section')
    expect(nodes[0]?.children?.[0]?.children?.[0]?.tag).toBe('article')
    expect(textContent(nodes)).toContain('Deep')
  })

  it('keeps sibling content when a streaming parse transitions to final', () => {
    const md = getMarkdown('issue-588-streaming-final-transition')
    const rightHeading = issue588Markdown.indexOf('## Right') + '## Right\n\n'.length

    const partial = parseMarkdownToStructure(issue588Markdown.slice(0, rightHeading), md, { final: false }) as any[]
    expect(textContent(partial)).toContain('Right')

    const finalNodes = parseMarkdownToStructure(issue588Markdown, md, { final: true }) as any[]
    expectIssue588Structure(finalNodes)
    expect(finalNodes[1]?.loading).toBe(false)
  })
})
