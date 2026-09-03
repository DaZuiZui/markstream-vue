<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDark } from './composables/useDark'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))
const isDark = useDark()

const demoMarkdownZh = `**Markstream** 正在逐 token 输出这段内容…

- 未闭合语法在流式过程中保持稳定
- 代码块渐进出现，不闪烁、不跳变
- Mermaid 与 KaTeX 完成即渲染

\`\`\`ts
const nodes = parseMarkdownToStructure(chunk)
\`\`\`

和真实 AI 聊天里的体验一致。`

const demoMarkdownEn = `**Markstream** is streaming this content token by token…

- Incomplete syntax stays stable while streaming
- Code blocks appear progressively without flicker
- Mermaid and KaTeX render the moment they close

\`\`\`ts
const nodes = parseMarkdownToStructure(chunk)
\`\`\`

Exactly like a real AI chat response.`

const demoMarkdown = computed(() => (isZh.value ? demoMarkdownZh : demoMarkdownEn))

// Render the full document during SSG, then replay the stream on the client.
const streamed = ref(demoMarkdown.value)
const isStreaming = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function stopStreaming() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

function startStreaming() {
  stopStreaming()
  const full = demoMarkdown.value
  let index = 0
  streamed.value = ''
  isStreaming.value = true
  timer = setInterval(() => {
    // Chunked "tokens", occasionally larger, like a real tokenizer.
    const size = 2 + Math.floor(Math.random() * 4)
    index = Math.min(full.length, index + size)
    streamed.value = full.slice(0, index)
    if (index >= full.length) {
      stopStreaming()
      isStreaming.value = false
    }
  }, 30)
}

onMounted(() => {
  startStreaming()
})

onBeforeUnmount(() => {
  stopStreaming()
})

watch(demoMarkdown, () => {
  streamed.value = demoMarkdown.value
  if (typeof window !== 'undefined')
    startStreaming()
})
</script>

<template>
  <div class="home-stream-demo">
    <div class="demo-header">
      <span class="demo-dot" />
      <span class="demo-title">{{ isZh ? 'AI 助手 · 流式输出' : 'AI assistant · streaming' }}</span>
      <button
        type="button"
        class="demo-replay"
        :aria-label="isZh ? '重播流式演示' : 'Replay streaming demo'"
        @click="startStreaming"
      >
        {{ isZh ? '重播' : 'Replay' }}
      </button>
    </div>
    <div class="demo-body">
      <MarkdownRender :key="demoMarkdown" :content="streamed" :is-dark="isDark" :fade="false" />
      <span v-if="isStreaming" class="demo-cursor" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.home-stream-demo {
  width: min(420px, 100%);
  margin: 0 auto;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-1);
  overflow: hidden;
  text-align: left;
}

.demo-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
}

.demo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.demo-title {
  flex: 1;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-replay {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  background: transparent;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.demo-replay:hover {
  border-color: var(--vp-c-brand-1);
}

.demo-body {
  position: relative;
  padding: 0.9rem 1rem 1rem;
  min-height: 240px;
  max-height: 320px;
  overflow-y: auto;
  font-size: 0.9rem;
  line-height: 1.6;
}

.demo-cursor {
  display: inline-block;
  width: 7px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--vp-c-brand-1);
  border-radius: 1px;
  animation: demo-cursor-blink 0.9s steps(1) infinite;
}

@keyframes demo-cursor-blink {
  50% {
    opacity: 0;
  }
}

@media (max-width: 960px) {
  .home-stream-demo {
    width: min(380px, 100%);
    margin-top: 1.5rem;
  }
}
</style>
