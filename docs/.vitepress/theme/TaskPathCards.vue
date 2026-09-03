<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

interface TaskCard {
  icon: string
  title: string
  description: string
  steps: { text: string, link: string }[]
}

const cardsEn: TaskCard[] = [
  {
    icon: '🌱',
    title: 'I am new here',
    description: 'Get your first render on screen in about 10 minutes.',
    steps: [
      { text: 'Vue Quick Start', link: '/guide/quick-start' },
      { text: 'Choose your framework', link: '/frameworks/' },
      { text: 'Browse the component gallery', link: '/components/' },
    ],
  },
  {
    icon: '💬',
    title: 'I am building an AI chat app',
    description: 'Stream SSE or token output without flicker.',
    steps: [
      { text: 'AI Chat & Streaming', link: '/guide/ai-chat-streaming' },
      { text: 'SSE & WebSocket Markdown', link: '/use-cases/sse-websocket' },
      { text: 'Performance', link: '/guide/performance' },
    ],
  },
  {
    icon: '📚',
    title: 'I run a docs site',
    description: 'Embed the renderer into VitePress or a content hub.',
    steps: [
      { text: 'Docs Site & VitePress', link: '/guide/vitepress-docs-integration' },
      { text: 'Tailwind & Styling', link: '/guide/tailwind' },
      { text: 'Custom tags', link: '/guide/custom-components' },
    ],
  },
  {
    icon: '🚑',
    title: 'Something is broken',
    description: 'Match the symptom you see to a fix path.',
    steps: [
      { text: 'Troubleshooting by Symptom', link: '/guide/troubleshooting-path' },
      { text: 'Troubleshooting deep dive', link: '/guide/troubleshooting' },
      { text: 'Installation & peers', link: '/guide/installation' },
    ],
  },
]

const cardsZh: TaskCard[] = [
  {
    icon: '🌱',
    title: '我是新手',
    description: '大约 10 分钟,让第一个渲染结果出现在屏幕上。',
    steps: [
      { text: 'Vue 快速开始', link: '/zh/guide/quick-start' },
      { text: '选择你的框架', link: '/zh/frameworks/' },
      { text: '逛逛组件画廊', link: '/zh/components/' },
    ],
  },
  {
    icon: '💬',
    title: '我在做 AI 聊天应用',
    description: '流式渲染 SSE / token 输出,不闪烁、不跳变。',
    steps: [
      { text: 'AI 聊天与流式输出', link: '/zh/guide/ai-chat-streaming' },
      { text: 'SSE 与 WebSocket Markdown', link: '/zh/use-cases/sse-websocket' },
      { text: '性能', link: '/zh/guide/performance' },
    ],
  },
  {
    icon: '📚',
    title: '我在做文档站',
    description: '把渲染器接进 VitePress 或内容型站点。',
    steps: [
      { text: '文档站与 VitePress', link: '/zh/guide/vitepress-docs-integration' },
      { text: 'Tailwind 与样式', link: '/zh/guide/tailwind' },
      { text: '自定义标签', link: '/zh/guide/custom-components' },
    ],
  },
  {
    icon: '🚑',
    title: '出问题了',
    description: '按你看到的现象,对号入座找到修复路径。',
    steps: [
      { text: '按症状排查', link: '/zh/guide/troubleshooting-path' },
      { text: '故障排除深入', link: '/zh/guide/troubleshooting' },
      { text: '安装与可选依赖', link: '/zh/guide/installation' },
    ],
  },
]

const cards = computed(() => (isZh.value ? cardsZh : cardsEn))
</script>

<template>
  <div class="ms-task-cards">
    <h2 class="ms-task-title">
      {{ isZh ? '你想做什么?' : 'What do you want to do?' }}
    </h2>
    <p class="ms-task-subtitle">
      {{
        isZh
          ? '按你的角色选一条最短路径,不用读完整本文档。'
          : 'Pick the shortest path for your role — no need to read everything first.'
      }}
    </p>
    <div class="ms-task-grid">
      <article v-for="card in cards" :key="card.title" class="ms-task-card">
        <h3 class="ms-task-card-title">
          <span aria-hidden="true">{{ card.icon }}</span>
          {{ card.title }}
        </h3>
        <p class="ms-task-card-desc">
          {{ card.description }}
        </p>
        <ol class="ms-task-card-steps">
          <li v-for="(step, i) in card.steps" :key="step.link">
            <span class="ms-task-step-index" aria-hidden="true">{{ i + 1 }}</span>
            <a :href="step.link">{{ step.text }}</a>
          </li>
        </ol>
      </article>
    </div>
  </div>
</template>

<style scoped>
.ms-task-cards {
  max-width: 1280px;
  margin: 2.5rem auto 0;
  padding: 0 24px;
}

@media (min-width: 640px) {
  .ms-task-cards {
    padding: 0 48px;
  }
}

@media (min-width: 960px) {
  .ms-task-cards {
    padding: 0 64px;
  }
}

.ms-task-title {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  margin: 0 0 0.35rem;
}

.ms-task-subtitle {
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
  margin: 0 0 1.25rem;
}

.ms-task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.ms-task-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  padding: 1.1rem 1.2rem;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
}

.ms-task-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-2);
  transform: translateY(-2px);
}

.ms-task-card-title {
  font-size: 1.02rem;
  font-weight: 650;
  color: var(--vp-c-text-1);
  margin: 0 0 0.4rem;
}

.ms-task-card-desc {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin: 0 0 0.85rem;
  flex: 1;
}

.ms-task-card-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.ms-task-card-steps li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.ms-task-step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 0.7rem;
  font-weight: 600;
  flex-shrink: 0;
}

.ms-task-card-steps a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
}

.ms-task-card-steps a:hover {
  text-decoration: underline;
}

@media (max-width: 960px) {
  .ms-task-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}

@media (max-width: 760px) {
  .ms-task-grid {
    grid-template-columns: 1fr;
  }
}
</style>
