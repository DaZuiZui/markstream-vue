// Generates per-component detail pages (EN + ZH) from
// docs/.vitepress/theme/data/components.ts.
//
// Run via `pnpm docs:gen-components` (invoked automatically before
// `docs:dev` and `docs:build`). Regenerate whenever the data file changes.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { componentCategories, componentsDocData } from '../docs/.vitepress/theme/data/components.ts'

const root = process.cwd()
const enDir = path.join(root, 'docs', 'components')
const zhDir = path.join(root, 'docs', 'zh', 'components')

function yamlSingleQuoted(value) {
  return `'${String(value).replace(/'/g, '\'\'')}'`
}

function frontmatterList(values) {
  return values.map(item => `  - ${yamlSingleQuoted(item)}`).join('\n')
}

function writeComponentPages(dir, locale) {
  fs.mkdirSync(dir, { recursive: true })

  // Remove stale generated pages only: index.md is handwritten, and so is any
  // other page without the generated marker — deleting those would silently
  // destroy hand-written content on the next docs:dev / docs:build run.
  const slugs = new Set(componentsDocData.map(entry => entry.slug))
  for (const file of fs.readdirSync(dir)) {
    if (file === 'index.md' || !file.endsWith('.md'))
      continue
    const slug = file.replace(/\.md$/, '')
    let looksGenerated = slugs.has(slug)
    if (!looksGenerated) {
      try {
        looksGenerated = fs.readFileSync(path.join(dir, file), 'utf8').includes('<ComponentDetail slug=')
      }
      catch {
        looksGenerated = false
      }
    }
    if (looksGenerated)
      fs.rmSync(path.join(dir, file))
  }

  const isZh = locale === 'zh'
  const importPath = isZh
    ? '../../.vitepress/theme/ComponentDetail.vue'
    : '../.vitepress/theme/ComponentDetail.vue'

  for (const entry of componentsDocData) {
    const category = componentCategories.find(item => item.key === entry.category)
    const categoryLabel = isZh ? (category?.zh ?? entry.category) : (category?.en ?? entry.category)
    // 'infra' reads awkwardly as a keyword; spell it out for SEO frontmatter.
    const keywordCategory = entry.category === 'infra' ? 'infrastructure' : entry.category
    const title = isZh ? `${entry.name} 组件详解` : `${entry.name} component`
    const h1 = isZh ? `${entry.name} 组件详解` : `${entry.name} component`
    const description = isZh
      ? `${entry.descriptionZh}它是 Markstream 流式 Markdown 渲染器中的内置${categoryLabel}节点组件，支持流式渐进渲染，可安全覆盖。`
      : `${entry.description} Built-in ${categoryLabel} node component of the Markstream streaming Markdown renderer, with a live preview, override notes, and related components.`
    const keywords = isZh
      ? [entry.name, 'markstream 组件', `${categoryLabel} 组件`, '流式 Markdown 渲染']
      : [entry.name, 'markstream component', `${keywordCategory} node`, 'streaming markdown']

    const content = `---
title: ${yamlSingleQuoted(title)}
description: ${yamlSingleQuoted(description)}
keywords:
${frontmatterList(keywords)}
---

# ${h1}

<script setup>
import ComponentDetail from '${importPath}'
</script>

<ComponentDetail slug="${entry.slug}" />
`
    fs.writeFileSync(path.join(dir, `${entry.slug}.md`), content, 'utf8')
  }

  return componentsDocData.length
}

const enCount = writeComponentPages(enDir, 'en')
const zhCount = writeComponentPages(zhDir, 'zh')
console.log(`Generated ${enCount} English and ${zhCount} Chinese component detail pages.`)
