<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

const props = defineProps<{
  /** Prerequisite links shown as chips. */
  items: { text: string, link?: string }[]
}>()

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

const label = computed(() => (isZh.value ? '前置条件' : 'Prerequisites'))
</script>

<template>
  <div v-if="props.items.length" class="ms-prereq">
    <span class="ms-prereq-label">{{ label }}</span>
    <div class="ms-prereq-chips">
      <template v-for="item in props.items" :key="item.text">
        <a v-if="item.link" :href="item.link" class="ms-prereq-chip">{{ item.text }}</a>
        <span v-else class="ms-prereq-chip">{{ item.text }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ms-prereq {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 0.75rem 0 1.25rem;
}

.ms-prereq-label {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  flex-shrink: 0;
}

.ms-prereq-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.ms-prereq-chip {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: var(--vp-c-default-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  padding: 0.18rem 0.7rem;
  text-decoration: none;
  transition: color 0.2s, border-color 0.2s;
}

a.ms-prereq-chip:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
</style>
