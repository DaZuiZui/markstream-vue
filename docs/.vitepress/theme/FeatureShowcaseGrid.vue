<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDark } from './composables/useDark'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))
const isDark = useDark()

interface ShowcaseCell {
  title: string
  md: string
  link: string
  /** Heavy renderers (mermaid / katex) skip SSG and only mount when played. */
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
      '  A[Stream] --> B{Closed?}',
      '  B --> C[Render]',
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
      '  A[流] --> B{闭合?}',
      '  B --> C[渲染]',
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

type CardState = 'full' | 'skeleton' | 'playing' | 'done'

// SSR renders the full document for non-lazy cells (SEO + no-JS), heavy
// cells start as a skeleton. On the client, every card replays its markdown
// as a token stream once it scrolls into view. The preview box has a fixed
// height, so streaming never changes the card size and the page cannot
// jitter.
const cardState = ref<CardState[]>(cellsEn.map(cell => (cell.lazy ? 'skeleton' : 'full')))
const streamed = ref<string[]>(cellsEn.map(() => ''))

watch(cells, (next) => {
  stopAll()
  cardState.value = next.map(cell => (cell.lazy ? 'skeleton' : 'full'))
  streamed.value = next.map(() => '')
})

const timers: (ReturnType<typeof setInterval> | undefined)[] = []

function stopCard(index: number) {
  if (timers[index]) {
    clearInterval(timers[index])
    timers[index] = undefined
  }
}

function stopAll() {
  timers.forEach((_, i) => stopCard(i))
}

function playCard(index: number) {
  const full = cells.value[index]?.md
  if (!full)
    return
  stopCard(index)
  let cursor = 0
  streamed.value[index] = ''
  cardState.value[index] = 'playing'
  timers[index] = setInterval(() => {
    // Chunked "tokens", occasionally larger, like a real tokenizer.
    const size = 3 + Math.floor(Math.random() * 5)
    cursor = Math.min(full.length, cursor + size)
    streamed.value[index] = full.slice(0, cursor)
    if (cursor >= full.length) {
      stopCard(index)
      cardState.value[index] = 'done'
    }
  }, 36)
}

function renderContent(index: number): string {
  if (cardState.value[index] === 'playing')
    return streamed.value[index]
  return cells.value[index]?.md ?? ''
}

const prefersReducedMotion
  = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let observer: IntersectionObserver | undefined

onMounted(() => {
  const root = document.querySelector('.ms-showcase')
  if (!root)
    return
  if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion) {
    // Without observers or with reduced motion, just show the full renders.
    cardState.value = cells.value.map(() => 'full')
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting)
          continue
        const index = Number((entry.target as HTMLElement).dataset.index)
        if (Number.isInteger(index)) {
          playCard(index)
          observer?.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '120px' },
  )
  root.querySelectorAll('.ms-showcase-card').forEach(el => observer?.observe(el))
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
  stopAll()
})
</script>

<template>
  <div class="ms-showcase-section ms-home-container">
    <h2 class="ms-showcase-heading">
      {{ isZh ? '开箱即用的渲染能力' : 'What you get out of the box' }}
    </h2>
    <p class="ms-showcase-subtitle">
      {{
        isZh
          ? '每张卡片都会像真实 AI 输出一样逐 token 流式播放 — 未闭合语法保持稳定，语法闭合的瞬间立即渲染。'
          : 'Every card replays its markdown as a live token stream — incomplete syntax stays stable, and blocks render the moment they close.'
      }}
    </p>
    <div class="ms-showcase">
      <div
        v-for="(cell, i) in cells"
        :key="cell.title"
        class="ms-showcase-card"
        :data-index="i"
      >
        <div class="ms-showcase-head">
          <h3 class="ms-showcase-title">
            {{ cell.title }}
          </h3>
          <div class="ms-showcase-tools">
            <button
              type="button"
              class="ms-showcase-replay"
              :aria-label="isZh ? `重播「${cell.title}」` : `Replay ${cell.title}`"
              @click="playCard(i)"
            >
              {{ isZh ? '⟳ 重播' : '⟳ Replay' }}
            </button>
            <a
              :href="cell.link"
              class="ms-showcase-more"
              :aria-label="isZh ? `查看 ${cell.title} 组件文档` : `View the ${cell.title} component docs`"
            >{{ isZh ? '文档 →' : 'Docs →' }}</a>
          </div>
        </div>
        <div class="ms-showcase-preview">
          <div v-if="cardState[i] === 'skeleton'" class="ms-showcase-skeleton" aria-hidden="true" />
          <MarkdownRender
            v-else
            :key="`${cell.title}-${cardState[i] === 'done' ? 'done' : 'live'}`"
            :content="renderContent(i)"
            :is-dark="isDark"
            :fade="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-home-container {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (min-width: 768px) {
  .ms-home-container {
    padding: 0 32px;
  }
}

@media (min-width: 960px) {
  .ms-home-container {
    padding: 0 48px;
  }
}

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
  min-height: 1.6rem;
}

.ms-showcase-title {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--vp-c-text-1);
  margin: 0;
}

.ms-showcase-tools {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.ms-showcase-replay {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s, border-color 0.2s;
}

.ms-showcase-card:hover .ms-showcase-replay,
.ms-showcase-replay:focus-visible {
  opacity: 1;
}

.ms-showcase-replay:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
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

/* Fixed height keeps the card (and the page) from reflowing while streaming. */
.ms-showcase-preview {
  height: 200px;
  overflow: hidden;
  font-size: 0.875rem;
  line-height: 1.6;
}

/* The mermaid block ships a ~360px interactive preview area, which would
   push its diagram below the fixed-height box. Shrink it to fit. */
.ms-showcase-preview :deep(.mermaid-preview-area),
.ms-showcase-preview :deep(._mermaid),
.ms-showcase-preview :deep(._mermaid > div) {
  min-height: 140px !important;
  height: 140px !important;
}

.ms-showcase-preview :deep(pre) {
  margin: 0.4rem 0;
}

.ms-showcase-skeleton {
  height: 100%;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
}

@media (max-width: 760px) {
  .ms-showcase {
    grid-template-columns: 1fr;
  }
}
</style>
