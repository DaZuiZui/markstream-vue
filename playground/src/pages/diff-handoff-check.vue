<script setup lang="ts">
import type { CodeBlockNode } from 'stream-markdown-parser'
import type { CodeBlockOptions } from '../../../src/types/component-props'
import { computed, ref } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'

type OverflowMode = NonNullable<CodeBlockOptions['overflow']>

function resolveInitialOverflow(): OverflowMode {
  if (typeof window === 'undefined')
    return 'wrap'

  return new URL(window.location.href).searchParams.get('codeOverflow') === 'scroll'
    ? 'scroll'
    : 'wrap'
}

function syncOverflowQuery(value: OverflowMode) {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)
  url.searchParams.set('codeOverflow', value)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

const isDark = ref(typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('theme') === 'dark')
const overflow = ref<OverflowMode>(resolveInitialOverflow())
const maxHeight = typeof window !== 'undefined'
  ? Number.parseFloat(new URLSearchParams(window.location.search).get('maxHeight') || '') || undefined
  : undefined

const ordinaryMarkdown = [
  '```ts src/handoff.ts',
  'export interface HandoffResult {',
  '  id: string',
  '  description: string',
  '}',
  '',
  'export function createHandoffResult(id: string): HandoffResult {',
  `  const description = '${'after-handoff-'.repeat(24)}'`,
  '  return { id, description }',
  '}',
  '```',
].join('\n')

const diffMarkdown = [
  '```diff ts:src/handoff.ts',
  ' export interface HandoffResult {',
  '   id: string',
  '   description: string',
  ' }',
  ' ',
  ' export function createHandoffResult(id: string): HandoffResult {',
  `-  const description = '${'before-handoff-'.repeat(24)}'`,
  `+  const description = '${'after-handoff-'.repeat(24)}'`,
  '   return { id, description }',
  ' }',
  '```',
].join('\n')

const diffNode: CodeBlockNode = {
  type: 'code_block',
  language: 'ts',
  code: [
    'export interface HandoffResult {',
    '  id: string',
    '  description: string',
    '}',
    '',
    'export function createHandoffResult(id: string): HandoffResult {',
    `  const description = '${'after-handoff-'.repeat(24)}'`,
    '  return { id, description }',
    '}',
  ].join('\n'),
  raw: diffMarkdown,
  diff: true,
  loading: false,
  originalCode: [
    'export interface HandoffResult {',
    '  id: string',
    '  description: string',
    '}',
    '',
    'export function createHandoffResult(id: string): HandoffResult {',
    `  const description = '${'before-handoff-'.repeat(24)}'`,
    '  return { id, description }',
    '}',
  ].join('\n'),
  updatedCode: [
    'export interface HandoffResult {',
    '  id: string',
    '  description: string',
    '}',
    '',
    'export function createHandoffResult(id: string): HandoffResult {',
    `  const description = '${'after-handoff-'.repeat(24)}'`,
    '  return { id, description }',
    '}',
  ].join('\n'),
}

interface HandoffScenario {
  id: string
  title: string
  markdown?: string
  nodes?: CodeBlockNode[]
  options: CodeBlockOptions
}

const scenarios = computed<HandoffScenario[]>(() => [
  {
    id: 'ordinary',
    title: 'Ordinary code',
    markdown: ordinaryMarkdown,
    options: {
      overflow: overflow.value,
      ...(maxHeight != null ? { maxHeight } : {}),
    } satisfies CodeBlockOptions,
  },
  {
    id: 'unified',
    title: 'Unified diff (one column)',
    nodes: [diffNode],
    options: {
      diffStyle: 'unified',
      overflow: overflow.value,
      ...(maxHeight != null ? { maxHeight } : {}),
    } satisfies CodeBlockOptions,
  },
  {
    id: 'split',
    title: 'Split diff (two columns)',
    nodes: [diffNode],
    options: {
      diffStyle: 'split',
      overflow: overflow.value,
      ...(maxHeight != null ? { maxHeight } : {}),
    } satisfies CodeBlockOptions,
  },
])

function setOverflow(value: OverflowMode) {
  overflow.value = value
  syncOverflowQuery(value)
}

syncOverflowQuery(overflow.value)
</script>

<template>
  <div
    class="handoff-check"
    :class="{ dark: isDark }"
    :data-handoff-overflow="overflow"
  >
    <header>
      <div>
        <h1>Code Pre → Highlight Handoff Matrix</h1>
        <p>Compare every enhanced surface with its permanent pre fallback.</p>
      </div>

      <div class="controls">
        <button
          type="button"
          data-overflow-toggle="wrap"
          :aria-pressed="overflow === 'wrap'"
          @click="setOverflow('wrap')"
        >
          Wrap
        </button>
        <button
          type="button"
          data-overflow-toggle="scroll"
          :aria-pressed="overflow === 'scroll'"
          @click="setOverflow('scroll')"
        >
          No wrap
        </button>
        <button type="button" @click="isDark = !isDark">
          Toggle dark
        </button>
      </div>
    </header>

    <section
      v-for="scenario in scenarios"
      :key="scenario.id"
      class="scenario"
      :data-handoff-scenario="scenario.id"
    >
      <h2>{{ scenario.title }}</h2>

      <div class="surface-grid">
        <article class="surface">
          <h3>Enhanced highlight</h3>
          <div
            class="col"
            :data-handoff-case="`${scenario.id}-enhanced`"
            :data-handoff-scenario="scenario.id"
            data-handoff-path="enhanced"
          >
            <MarkdownRender
              :content="scenario.markdown"
              :nodes="scenario.nodes"
              :final="true"
              :is-dark="isDark"
              :code-block-options="scenario.options"
              :code-block-props="{ showLineNumbers: true }"
              code-block-dark-theme="vitesse-dark"
              code-block-light-theme="vitesse-light"
            />
          </div>
        </article>

        <article class="surface">
          <h3>Pre fallback</h3>
          <div
            class="col"
            :data-handoff-case="`${scenario.id}-pre`"
            :data-handoff-scenario="scenario.id"
            data-handoff-path="pre"
          >
            <MarkdownRender
              :content="scenario.markdown"
              :nodes="scenario.nodes"
              :final="true"
              :is-dark="isDark"
              render-code-blocks-as-pre
              :code-block-options="scenario.options"
              :code-block-props="{ showLineNumbers: true }"
              code-block-dark-theme="vitesse-dark"
              code-block-light-theme="vitesse-light"
            />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.handoff-check {
  min-height: 100vh;
  padding: 24px;
  font-family: system-ui, sans-serif;
  background: #f5f7fb;
}

.handoff-check.dark {
  color: #e2e8f0;
  background: #0b1220;
}

header {
  display: flex;
  max-width: 1760px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

h1,
header p {
  margin: 0;
}

header p {
  margin-top: 8px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  border: 1px solid #94a3b8;
  border-radius: 8px;
  padding: 8px 12px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

button[aria-pressed='true'] {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.scenario {
  max-width: 1760px;
  margin-top: 32px;
}

.scenario h2,
.surface h3 {
  margin: 0;
}

.surface-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 12px;
}

.surface {
  min-width: 0;
}

.surface h3 {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.col {
  min-width: 0;
}

@media (max-width: 900px) {
  header {
    align-items: flex-start;
    flex-direction: column;
  }

  .surface-grid {
    grid-template-columns: 1fr;
  }
}
</style>
