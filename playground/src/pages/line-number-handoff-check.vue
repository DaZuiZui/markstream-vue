<script setup lang="ts">
import { ref } from 'vue'
import type { CodeBlockOptions } from '../../../src/types/component-props'
import MarkdownRender from '../../../src/components/NodeRenderer'

const isDark = ref(typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('theme') === 'dark')
const overflow = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('codeOverflow') === 'scroll'
  ? 'scroll'
  : 'wrap'
const codeBlockOptions: CodeBlockOptions = { overflow }

const markdown = [
  '# Pre → Highlight Line Number Handoff',
  '',
  '```ts',
  'export function chunk(input: string) {',
  '  const lines = input.split(/\\r?\\n/)',
  `  return lines.map((line, index) => ({ index, value: line.trim(), description: '${'handoff-description-'.repeat(24)}' }))`,
  '}',
  '',
  'for (const item of chunk(\'alpha\\nbeta\\ngamma\')) {',
  '  console.log(item.index, item.value)',
  '}',
  '',
  'function done() {',
  '  return true',
  '}',
  'done()',
  '```',
].join('\n')
</script>

<template>
  <div class="handoff-check" :class="{ dark: isDark }">
    <header>
      <h1>Pre → Highlight Line Number Handoff</h1>
      <button type="button" @click="isDark = !isDark">
        Toggle dark
      </button>
    </header>

    <h2>1) Highlight (stream-diffs, default)</h2>
    <section class="col" data-handoff-case="enhanced">
      <MarkdownRender :content="markdown" :final="true" :is-dark="isDark" :code-block-options="codeBlockOptions" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" />
    </section>

    <h2>2) Pre fallback (render-code-blocks-as-pre)</h2>
    <section class="col" data-handoff-case="pre">
      <MarkdownRender :content="markdown" :final="true" :is-dark="isDark" render-code-blocks-as-pre :code-block-options="codeBlockOptions" :code-block-props="{ showLineNumbers: true }" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" />
    </section>
  </div>
</template>

<style scoped>
.handoff-check {
  padding: 24px;
  font-family: system-ui, sans-serif;
  background: #f5f7fb;
  min-height: 100vh;
}
.handoff-check.dark {
  background: #0b1220;
  color: #e2e8f0;
}
.col {
  max-width: 860px;
  margin-bottom: 32px;
}
h2 {
  margin-top: 20px;
}
</style>
