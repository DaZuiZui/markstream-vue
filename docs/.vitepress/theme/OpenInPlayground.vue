<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  /** Markdown source copied to the clipboard before opening the playground. */
  md: string
  playgroundUrl?: string
}>()

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const playground = computed(() => props.playgroundUrl || 'https://markstream-vue.simonhe.me/')

async function openPlayground() {
  try {
    await navigator.clipboard.writeText(props.md)
    copied.value = true
    if (copiedTimer)
      clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 2400)
  }
  catch {
    // Clipboard may be unavailable; still open the playground.
  }
  window.open(playground.value, '_blank', 'noopener')
}

onBeforeUnmount(() => {
  if (copiedTimer)
    clearTimeout(copiedTimer)
})
</script>

<template>
  <button type="button" class="ms-open-playground" @click="openPlayground">
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
    <span v-if="copied">{{
      isZh ? '已复制 Markdown，Playground 已打开' : 'Markdown copied — playground opened'
    }}</span>
    <span v-else>{{
      isZh ? '复制 Markdown 并打开 Playground' : 'Copy markdown & open playground'
    }}</span>
  </button>
</template>

<style scoped>
.ms-open-playground {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--vp-button-alt-text);
  background: var(--vp-button-alt-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 20px;
  padding: 0.45rem 1rem;
  cursor: pointer;
  transition: border-color 0.25s, color 0.25s, background 0.25s;
}

.ms-open-playground:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
