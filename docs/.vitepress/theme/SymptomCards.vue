<script setup lang="ts">
import { useData, withBase } from 'vitepress'
import { computed, onBeforeUnmount, ref } from 'vue'

interface LocalizedText {
  en: string
  zh: string
}

interface LocalizedList {
  en: string[]
  zh: string[]
}

interface SymptomLink {
  label: LocalizedText
  href: LocalizedText
}

interface SymptomCardData {
  emoji: string
  title: LocalizedText
  causes: LocalizedList
  cta: SymptomLink
  related: SymptomLink[]
}

const symptomCards: SymptomCardData[] = [
  {
    emoji: '🎨',
    title: {
      en: 'Styles are missing or unstyled',
      zh: '样式丢失 / 没有颜色',
    },
    causes: {
      en: [
        'Reset or index.css imported in the wrong order',
        'Tailwind / UnoCSS overriding renderer styles',
        'Peer CSS such as katex.min.css is not imported',
      ],
      zh: [
        'reset 或 index.css 的导入顺序不对',
        'Tailwind / UnoCSS 把渲染器样式盖掉了',
        'katex.min.css 这类 peer CSS 没有导入',
      ],
    },
    cta: {
      label: { en: 'Open the CSS checklist', zh: '打开 CSS 排查清单' },
      href: {
        en: '/guide/troubleshooting#css-looks-wrong-start-here',
        zh: '/zh/guide/troubleshooting#css-looks-wrong-start-here',
      },
    },
    related: [
      {
        label: { en: 'Tailwind Integration & Style Ordering', zh: 'Tailwind 集成与样式顺序' },
        href: { en: '/guide/tailwind', zh: '/zh/guide/tailwind' },
      },
      {
        label: { en: 'Installation', zh: '安装' },
        href: { en: '/guide/installation', zh: '/zh/guide/installation' },
      },
    ],
  },
  {
    emoji: '📊',
    title: {
      en: 'Diagrams do not render, or flicker',
      zh: '图表不渲染或闪烁',
    },
    causes: {
      en: [
        'Peer package (mermaid, @terrastruct/d2) not installed',
        'Worker or SSR boundary blocks browser-only rendering',
        'Fence is still unclosed while the stream is running',
      ],
      zh: [
        'mermaid、@terrastruct/d2 等 peer 没有安装',
        'worker 或 SSR 边界挡住了浏览器端渲染',
        '流式进行中 fence 还没有闭合',
      ],
    },
    cta: {
      label: { en: 'Mermaid quick start', zh: 'Mermaid 快速上手' },
      href: { en: '/guide/mermaid', zh: '/zh/guide/mermaid' },
    },
    related: [
      {
        label: { en: 'D2 quick start', zh: 'D2 快速上手' },
        href: { en: '/guide/d2', zh: '/zh/guide/d2' },
      },
      {
        label: { en: 'AntV Infographic', zh: 'AntV Infographic 图表集成' },
        href: { en: '/guide/infographic', zh: '/zh/guide/infographic' },
      },
    ],
  },
  {
    emoji: '⚙️',
    title: {
      en: 'SSR or build errors (Nuxt, hydration, workers)',
      zh: 'SSR / 构建报错（Nuxt、hydration、worker）',
    },
    causes: {
      en: [
        'window is not defined during server render or build',
        'Server and client hydration output mismatch',
        'Browser-only peer initialized on the server',
      ],
      zh: [
        '服务端渲染或构建时 window is not defined',
        '服务端与客户端的 hydration 输出对不上',
        '浏览器专属 peer 在服务端被初始化',
      ],
    },
    cta: {
      label: { en: 'Nuxt SSR guide', zh: 'Nuxt SSR 指南' },
      href: { en: '/nuxt-ssr', zh: '/zh/nuxt-ssr' },
    },
    related: [
      {
        label: { en: 'Troubleshooting', zh: '排查问题' },
        href: { en: '/guide/troubleshooting', zh: '/zh/guide/troubleshooting' },
      },
    ],
  },
  {
    emoji: '⚡',
    title: {
      en: 'Content jumps or flickers while streaming',
      zh: '流式输出时内容跳动 / 闪烁',
    },
    causes: {
      en: [
        'Markdown re-parsed inside MarkdownRender on every token',
        'nodes + final not used for incremental updates',
        'Heavy renderers kept on during streaming',
      ],
      zh: [
        '每个 token 都在 MarkdownRender 里重新解析',
        '没有用 nodes + final 做增量更新',
        '流式过程中一直开着重型渲染器',
      ],
    },
    cta: {
      label: { en: 'AI chat & streaming', zh: 'AI 聊天与流式输出' },
      href: { en: '/guide/ai-chat-streaming', zh: '/zh/guide/ai-chat-streaming' },
    },
    related: [
      {
        label: { en: 'Streaming performance tuning', zh: '性能优化' },
        href: { en: '/guide/performance', zh: '/zh/guide/performance' },
      },
    ],
  },
  {
    emoji: '📦',
    title: {
      en: 'Peer dependency warnings (katex, mermaid)',
      zh: 'peer 依赖警告（katex、mermaid 等）',
    },
    causes: {
      en: [
        'Optional peer like katex or mermaid is not installed',
        'Peer installed but its CSS is missing',
        'Installed version outside the supported range',
      ],
      zh: [
        'katex、mermaid 这类可选 peer 没有安装',
        'peer 装了，但对应的 CSS 没有导入',
        '安装的版本超出了受支持范围',
      ],
    },
    cta: {
      label: { en: 'Installation guide', zh: '安装指南' },
      href: { en: '/guide/installation', zh: '/zh/guide/installation' },
    },
    related: [
      {
        label: { en: 'Math rendering with KaTeX', zh: '数学公式（KaTeX）' },
        href: { en: '/guide/math', zh: '/zh/guide/math' },
      },
    ],
  },
  {
    emoji: '🐢',
    title: {
      en: 'Long documents render slowly',
      zh: '长文档 / 性能问题',
    },
    causes: {
      en: [
        'Whole document re-parsed on every update',
        'Math, diagrams, or diffs enabled on long inputs',
        'No chunked or virtualized rendering',
      ],
      zh: [
        '每次更新都整篇重新解析',
        '长输入上开了数学、图表或 diff',
        '没有做分块或虚拟化渲染',
      ],
    },
    cta: {
      label: { en: 'Performance guide', zh: '性能优化指南' },
      href: { en: '/guide/performance', zh: '/zh/guide/performance' },
    },
    related: [
      {
        label: { en: 'Parser Performance Baseline', zh: '解析器性能基线' },
        href: { en: '/guide/parser-performance-baseline', zh: '/zh/guide/parser-performance-baseline' },
      },
    ],
  },
]

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

function localizeText(value: LocalizedText): string {
  return isZh.value ? value.zh : value.en
}

function localizeList(value: LocalizedList): string[] {
  return isZh.value ? value.zh : value.en
}

function resolveLink(link: SymptomLink): { label: string, href: string } {
  return {
    label: localizeText(link.label),
    href: withBase(localizeText(link.href)),
  }
}

const resolvedCards = computed(() => symptomCards.map((card, index) => ({
  id: index,
  emoji: card.emoji,
  title: localizeText(card.title),
  causes: localizeList(card.causes),
  cta: resolveLink(card.cta),
  related: card.related.map(link => resolveLink(link)),
})))

const relatedLabel = computed(() => isZh.value ? '另见：' : 'Also read:')

const banner = computed(() => isZh.value
  ? {
      title: '还是没头绪？带上诊断信息再问',
      description: '复制一份 issue 模板（含环境、症状、复现步骤占位），粘贴到 GitHub issue 后填好，维护者能更快帮你定位。',
    }
  : {
      title: 'Still stuck? Bring diagnostics with you',
      description: 'Copy an issue template with environment, symptom, and reproduction placeholders, then fill it in when you open a GitHub issue.',
    })

const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
let copyResetTimer: ReturnType<typeof setTimeout> | undefined

const copyLabel = computed(() => {
  if (copyState.value === 'copied')
    return isZh.value ? '已复制' : 'Copied!'
  if (copyState.value === 'failed')
    return isZh.value ? '复制失败' : 'Copy failed'
  return isZh.value ? '复制 issue 模板' : 'Copy issue template'
})

function buildIssueTemplate(): string {
  const lines = isZh.value
    ? [
        '### 环境',
        '',
        '- markstream-vue 版本：<!-- 运行 `pnpm list markstream-vue` 并粘贴输出 -->',
        '- Vue 版本：<!-- 如 3.5.x -->',
        '- 框架 / 构建方式：<!-- 纯 Vue、Nuxt、VitePress 文档、Vite、Webpack… -->',
        '- 已安装的可选 peers：<!-- mermaid / katex / stream-diffs / @terrastruct/d2 / 无 -->',
        '- 是否使用 Tailwind / UnoCSS：<!-- 是 / 否 -->',
        '- 是否涉及 SSR：<!-- 是 / 否 -->',
        '',
        '### 症状',
        '',
        '<!-- 你看到的现象：样式错乱 / 图表不渲染 / SSR 或构建报错 / 流式闪烁 / 渲染缓慢 -->',
        '',
        '### 最小复现',
        '',
        '<!-- 能复现问题的最小 Markdown 输入 -->',
        '',
        '```md',
        '<!-- 在这里粘贴最小 Markdown 示例 -->',
        '```',
        '',
        '### 复现步骤',
        '',
        '1. <!-- 步骤 1 -->',
        '2. <!-- 步骤 2 -->',
        '',
        '### 控制台输出',
        '',
        '<!-- 在这里粘贴报错与警告 -->',
      ]
    : [
        '### Environment',
        '',
        '- markstream-vue version: <!-- run `pnpm list markstream-vue` and paste the output -->',
        '- Vue version: <!-- e.g. 3.5.x -->',
        '- Framework / build setup: <!-- plain Vue, Nuxt, VitePress docs, Vite, Webpack... -->',
        '- Optional peers installed: <!-- mermaid / katex / stream-diffs / @terrastruct/d2 / none -->',
        '- Tailwind or UnoCSS involved: <!-- yes / no -->',
        '- SSR involved: <!-- yes / no -->',
        '',
        '### Symptom',
        '',
        '<!-- What you see: broken styles / diagram not rendering / SSR or build error / flicker while streaming / slow rendering -->',
        '',
        '### Minimal reproduction',
        '',
        '<!-- The smallest Markdown input that reproduces the issue -->',
        '',
        '```md',
        '<!-- paste the minimal Markdown sample here -->',
        '```',
        '',
        '### Steps to reproduce',
        '',
        '1. <!-- step 1 -->',
        '2. <!-- step 2 -->',
        '',
        '### Console output',
        '',
        '<!-- paste errors and warnings here -->',
      ]

  return lines.join('\n')
}

function copyWithHiddenTextarea(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()

  let copied = false
  try {
    // Deprecated but kept as a fallback for non-secure contexts where the
    // async Clipboard API is unavailable (e.g. plain http:// previews).
    copied = document.execCommand('copy')
  }
  catch {
    copied = false
  }

  textarea.remove()
  return copied
}

async function copyDiagnostics(): Promise<void> {
  const text = buildIssueTemplate()
  let copied = false

  try {
    await navigator.clipboard.writeText(text)
    copied = true
  }
  catch {
    copied = copyWithHiddenTextarea(text)
  }

  copyState.value = copied ? 'copied' : 'failed'

  if (copyResetTimer)
    clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, 2400)
}

onBeforeUnmount(() => {
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
})
</script>

<template>
  <div class="symptom-hub">
    <div class="symptom-hub__grid">
      <article
        v-for="card in resolvedCards"
        :key="card.id"
        class="symptom-hub__card"
      >
        <h3 class="symptom-hub__card-title">
          <span
            class="symptom-hub__card-emoji"
            aria-hidden="true"
          >{{ card.emoji }}</span>
          <span>{{ card.title }}</span>
        </h3>

        <ul class="symptom-hub__causes">
          <li
            v-for="cause in card.causes"
            :key="cause"
          >
            <span
              class="symptom-hub__cause-check"
              aria-hidden="true"
            >✓</span>
            <span>{{ cause }}</span>
          </li>
        </ul>

        <a
          :href="card.cta.href"
          class="symptom-hub__cta"
        >{{ card.cta.label }}</a>

        <p class="symptom-hub__related">
          <span class="symptom-hub__related-label">{{ relatedLabel }}</span>
          <template
            v-for="(link, index) in card.related"
            :key="link.href"
          >
            <span
              v-if="index > 0"
              class="symptom-hub__related-sep"
              aria-hidden="true"
            >·</span>
            <a
              :href="link.href"
              class="symptom-hub__related-link"
            >{{ link.label }}</a>
          </template>
        </p>
      </article>
    </div>

    <div class="symptom-hub__banner">
      <div class="symptom-hub__banner-copy">
        <h3 class="symptom-hub__banner-title">
          {{ banner.title }}
        </h3>
        <p class="symptom-hub__banner-description">
          {{ banner.description }}
        </p>
      </div>
      <button
        type="button"
        class="symptom-hub__copy-button"
        :class="{ 'is-copied': copyState === 'copied' }"
        aria-live="polite"
        @click="copyDiagnostics"
      >
        {{ copyLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.symptom-hub {
  margin: 16px 0 8px;
}

.symptom-hub__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 16px;
}

@media (max-width: 640px) {
  .symptom-hub__grid {
    grid-template-columns: 1fr;
  }
}

.symptom-hub__card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background-color: var(--vp-c-bg-soft);
  transition:
    border-color 0.25s,
    box-shadow 0.25s,
    transform 0.25s;
}

.symptom-hub__card:hover {
  border-color: var(--vp-c-brand);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
}

.dark .symptom-hub__card:hover {
  box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
}

.symptom-hub__card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}

.symptom-hub__card-emoji {
  flex-shrink: 0;
  font-size: 20px;
  line-height: 1;
}

.symptom-hub__causes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.symptom-hub__causes li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.symptom-hub__cause-check {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--vp-c-brand);
}

.symptom-hub__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: auto;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-radius: 20px;
  background-color: var(--vp-c-brand-3, var(--vp-c-brand));
  color: var(--vp-c-white);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  text-decoration: none;
  transition: background-color 0.25s;
}

.symptom-hub__cta:hover {
  background-color: var(--vp-c-brand-2, var(--vp-c-brand));
  color: var(--vp-c-white);
  text-decoration: none;
}

.symptom-hub__cta:focus-visible {
  outline: 2px solid var(--vp-c-brand);
  outline-offset: 2px;
}

.symptom-hub__related {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.symptom-hub__related-label {
  margin-right: 4px;
}

.symptom-hub__related-sep {
  color: var(--vp-c-text-3);
}

.symptom-hub__banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  margin-top: 16px;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background-color: var(--vp-c-bg-soft);
}

.symptom-hub__banner-copy {
  flex: 1 1 320px;
  min-width: 0;
}

.symptom-hub__banner-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}

.symptom-hub__banner-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.symptom-hub__copy-button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-radius: 20px;
  background-color: var(--vp-c-brand-3, var(--vp-c-brand));
  color: var(--vp-c-white);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  transition: background-color 0.25s;
}

.symptom-hub__copy-button:hover {
  background-color: var(--vp-c-brand-2, var(--vp-c-brand));
}

.symptom-hub__copy-button:focus-visible {
  outline: 2px solid var(--vp-c-brand);
  outline-offset: 2px;
}

.symptom-hub__copy-button.is-copied {
  background-color: var(--vp-c-green-3, var(--vp-c-brand));
}
</style>
