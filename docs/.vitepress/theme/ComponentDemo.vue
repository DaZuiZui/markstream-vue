<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useData } from 'vitepress'
import { computed, ref } from 'vue'
import { useDark } from './composables/useDark'
import { optionalMarkdownIt } from './optionalMarkdownIt'

const props = defineProps<{
  /** Markdown source that exercises the component. */
  md: string
  /** Component slug, used to opt in optional markdown-it plugins for preview. */
  slug?: string
}>()

const customMarkdownIt = computed(() => (props.slug ? optionalMarkdownIt(props.slug) : undefined))

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))
const isDark = useDark()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(props.md)
    copied.value = true
    if (copiedTimer)
      clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 1600)
  }
  catch {
    // Clipboard may be unavailable (insecure context); ignore silently.
  }
}
</script>

<template>
  <div class="ms-component-demo">
    <div class="ms-demo-pane">
      <div class="ms-demo-pane-head">
        <span>{{ isZh ? 'Markdown 输入' : 'Markdown input' }}</span>
        <button type="button" class="ms-demo-copy" @click="copyMarkdown">
          {{ copied ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy') }}
        </button>
      </div>
      <pre class="ms-demo-input"><code>{{ md }}</code></pre>
    </div>
    <div class="ms-demo-pane">
      <div class="ms-demo-pane-head">
        <span>{{ isZh ? '实时渲染输出' : 'Live rendered output' }}</span>
      </div>
      <div class="ms-demo-output">
        <MarkdownRender v-if="md" :content="md" :custom-markdown-it="customMarkdownIt" :is-dark="isDark" :fade="false" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-component-demo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0 1.5rem;
}

.ms-demo-pane {
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ms-demo-pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.ms-demo-copy {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  background: transparent;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  cursor: pointer;
  transition: border-color 0.2s;
}

.ms-demo-copy:hover {
  border-color: var(--vp-c-brand-1);
}

.ms-demo-input {
  margin: 0;
  padding: 0.75rem;
  overflow: auto;
  max-height: 420px;
  font-size: 0.8rem;
  line-height: 1.5;
  background: var(--vp-c-bg-soft);
}

.ms-demo-input code {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  white-space: pre;
}

.ms-demo-output {
  padding: 0.75rem 0.9rem;
  overflow: auto;
  max-height: 420px;
  font-size: 0.9rem;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .ms-component-demo {
    grid-template-columns: 1fr;
  }
}
</style>
