<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDark } from './composables/useDark'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))
const isDark = useDark()

interface ShowcaseCell {
  title: string
  md: string
  link: string
  /** Heavy renderers (mermaid / katex) are mounted only when scrolled near. */
  lazy: boolean
}

const cellsEn: ShowcaseCell[] = [
  {
    title: 'Code blocks',
    md: [
      '```ts',
      'const nodes = parseMarkdownToStructure(chunk)',
      '// streaming-safe, highlighted, copyable',
      '```',
    ].join('\n'),
    link: '/components/code-block-node',
    lazy: false,
  },
  {
    title: 'Mermaid diagrams',
    md: [
      '```mermaid',
      'flowchart LR',
      '  A[Token stream] --> B{Syntax closed?}',
      '  B -- yes --> C[Render now]',
      '  B -- no --> D[Stable placeholder]',
      '```',
    ].join('\n'),
    link: '/components/mermaid-block-node',
    lazy: true,
  },
  {
    title: 'Math (KaTeX)',
    md: 'Mass-energy equivalence $E = mc^2$ and Euler\'s identity $e^{i\\pi} + 1 = 0$ render inline while streaming.',
    link: '/components/math-inline-node',
    lazy: true,
  },
  {
    title: 'GFM tables & task lists',
    md: [
      '| Feature | Status |',
      '| --- | --- |',
      '| Streaming | ✅ |',
      '| Mermaid | ✅ |',
      '',
      '- [x] Stable while streaming',
      '- [ ] Your feature here',
    ].join('\n'),
    link: '/components/table-node',
    lazy: false,
  },
  {
    title: 'Rich typography',
    md: 'Use ==highlights==, ++insertions++, ~~strikethrough~~, and inline math like H~2~O or x^2^.',
    link: '/components/highlight-node',
    lazy: false,
  },
  {
    title: 'Admonition containers',
    md: [
      '::: tip Pro tip',
      'Wrap any block in a styled container.',
      ':::',
    ].join('\n'),
    link: '/components/admonition-node',
    lazy: false,
  },
]

const cellsZh: ShowcaseCell[] = [
  {
    title: '代码块',
    md: [
      '```ts',
      'const nodes = parseMarkdownToStructure(chunk)',
      '// 流式安全、带高亮、可复制',
      '```',
    ].join('\n'),
    link: '/zh/components/code-block-node',
    lazy: false,
  },
  {
    title: 'Mermaid 图表',
    md: [
      '```mermaid',
      'flowchart LR',
      '  A[Token 流] --> B{语法闭合?}',
      '  B -- 是 --> C[立即渲染]',
      '  B -- 否 --> D[稳定占位]',
      '```',
    ].join('\n'),
    link: '/zh/components/mermaid-block-node',
    lazy: true,
  },
  {
    title: '数学公式(KaTeX)',
    md: '质能方程 $E = mc^2$ 与欧拉恒等式 $e^{i\\pi} + 1 = 0$ 都能边流式边渲染。',
    link: '/zh/components/math-inline-node',
    lazy: true,
  },
  {
    title: 'GFM 表格与任务列表',
    md: [
      '| 能力 | 状态 |',
      '| --- | --- |',
      '| 流式渲染 | ✅ |',
      '| Mermaid | ✅ |',
      '',
      '- [x] 流式过程中保持稳定',
      '- [ ] 你的想法',
    ].join('\n'),
    link: '/zh/components/table-node',
    lazy: false,
  },
  {
    title: '富文本排版',
    md: '支持 ==高亮==、++插入++、~~删除线~~，以及 H~2~O、x^2^ 这类行内排版。',
    link: '/zh/components/highlight-node',
    lazy: false,
  },
  {
    title: '提示容器',
    md: [
      '::: tip 小技巧',
      '任何块级内容都能包进带样式的容器。',
      ':::',
    ].join('\n'),
    link: '/zh/components/admonition-node',
    lazy: false,
  },
]

const cells = computed(() => (isZh.value ? cellsZh : cellsEn))

const visibleHeavy = ref(new Set<number>())
let observer: IntersectionObserver | undefined

function isCellVisible(index: number): boolean {
  const cell = cells.value[index]
  if (!cell || !cell.lazy)
    return true
  return visibleHeavy.value.has(index)
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    visibleHeavy.value = new Set(cells.value.map((_, i) => i))
    return
  }
  const root = document.querySelector('.ms-showcase')
  if (!root)
    return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting)
          continue
        const index = Number((entry.target as HTMLElement).dataset.index)
        if (Number.isInteger(index)) {
          visibleHeavy.value = new Set(visibleHeavy.value).add(index)
          observer?.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '200px' },
  )
  root.querySelectorAll('[data-lazy="true"]').forEach(el => observer?.observe(el))
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
})
</script>

<template>
  <div class="ms-showcase-section">
    <h2 class="ms-showcase-heading">
      {{ isZh ? '开箱即用的渲染能力' : 'What you get out of the box' }}
    </h2>
    <p class="ms-showcase-subtitle">
      {{
        isZh
          ? '每张卡片都是真实渲染结果 — 点击进入对应组件文档,复制示例即可使用。'
          : 'Every card is a live render — click through to the component docs and copy the example.'
      }}
    </p>
    <div class="ms-showcase">
      <div
        v-for="(cell, i) in cells"
        :key="cell.title"
        class="ms-showcase-card"
        :data-index="i"
        :data-lazy="cell.lazy ? 'true' : undefined"
      >
        <div class="ms-showcase-head">
          <h3 class="ms-showcase-title">
            {{ cell.title }}
          </h3>
          <a
            :href="cell.link"
            class="ms-showcase-more"
            :aria-label="isZh ? `查看 ${cell.title} 组件文档` : `View the ${cell.title} component docs`"
          >{{ isZh ? '文档 →' : 'Docs →' }}</a>
        </div>
        <div class="ms-showcase-preview">
          <MarkdownRender v-if="isCellVisible(i)" :key="cell.md" :content="cell.md" :is-dark="isDark" :fade="false" />
          <div v-else class="ms-showcase-skeleton" aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-showcase-section {
  margin-top: 2.5rem;
}

.ms-showcase-heading {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  margin: 0 0 0.35rem;
}

.ms-showcase-subtitle {
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
  margin: 0 0 1.25rem;
}

.ms-showcase {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.ms-showcase-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  padding: 1rem 1.1rem 1.1rem;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
}

.ms-showcase-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-2);
  transform: translateY(-2px);
}

.ms-showcase-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.ms-showcase-title {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--vp-c-text-1);
  margin: 0;
}

.ms-showcase-more {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  white-space: nowrap;
}

.ms-showcase-more:hover {
  text-decoration: underline;
}

.ms-showcase-preview {
  flex: 1;
  font-size: 0.875rem;
  line-height: 1.6;
  overflow: hidden;
}

.ms-showcase-preview :deep(pre) {
  margin: 0.5rem 0;
}

.ms-showcase-skeleton {
  min-height: 120px;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
}

@media (max-width: 760px) {
  .ms-showcase {
    grid-template-columns: 1fr;
  }
}
</style>
