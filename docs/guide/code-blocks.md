---
title: Code Block Rendering
description: How markstream-vue renders code blocks with the optional stream-diffs File/FileDiff surface or the plain pre/code fallback.
keywords:
  - code block rendering
  - streaming code blocks
  - stream-diffs
  - code block options
---
# Code Block Rendering

## Overview

Code blocks can be rendered in two ways depending on which optional dependency you install:

- Enhanced surface (recommended for large or interactive code blocks): install `stream-diffs` for File and FileDiff rendering, syntax highlighting, and diff interactions. `CodeBlockNode` loads the core runtime on demand after the code block has completed streaming and entered the viewport.
- Fallback (no extra deps): if `stream-diffs` is not installed, code blocks render as plain `<pre><code>` blocks with basic styling.

## stream-diffs surface (recommended)

- Install:

```bash
pnpm add stream-diffs
# or
npm i stream-diffs
```

- Boundary: the `stream-diffs` root entry is framework-agnostic. Its controllers receive an `HTMLElement` and plain code/diff data; it has no Vue lifecycle. `stream-diffs/vue` is a separate optional convenience entry and is not used by `markstream-vue`.
- Behavior: this Vue adapter keeps the stable `PreCodeNode` representation while content is streaming. Once the block is complete and visible, `CodeBlockNode` mounts one `stream-diffs` File or FileDiff surface and applies language highlighting.
- The fallback and enhanced surfaces reserve a four-character minimum line-number column. This keeps the gutter stable while streamed content crosses the 10, 100, or 1000 line boundary; longer line numbers expand the column as needed.
- `CodeBlockShell` owns the title and action bar. The inner `data-diffs-header` is disabled so File surfaces do not render a second header.
- No worker plugin or extra CSS import is required for this integration. See also: [/guide/code-block-runtime](/guide/code-block-runtime) for runtime and preload details.

### Configuration

Use the renderer-neutral `codeBlockOptions` prop on either `MarkdownRender` / `NodeRenderer` or a directly mounted `CodeBlockNode`. The same public `CodeBlockOptions` type is exported by all six framework adapters.

```vue
<script setup lang="ts">
import type { CodeBlockOptions } from 'markstream-vue'

const codeBlockOptions: CodeBlockOptions = {
  fontSize: 13,
  overflow: 'wrap',
  diffStyle: 'unified',
  expandUnchanged: false,
  enableLineSelection: true,
}
</script>

<template>
  <MarkdownRender
    :content="content"
    :code-block-options="codeBlockOptions"
  />
</template>
```

Typography/layout fields (`fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, `tabSize`) are coordinated by Markstream so the streaming fallback and finalized surface match. Supported File/FileDiff fields include `disableLineNumbers`, `overflow`, highlighter limits, diff layout/folding, interactions, selection callbacks, annotations, `onController`, and `workerManager`. Theme, language/content, streaming state, header, mounting, reveal, and disposal stay host-owned and take precedence.

Themes are registered string names. Direct `CodeBlockNode.theme` accepts a string or `{ dark, light }`, while `themes` is the `[dark, light]` pair to load. A former Monaco JSON theme object has no direct rename: use `registerCustomTheme` from `stream-diffs/pierre`, then pass its name.

See [/guide/code-block-runtime](/guide/code-block-runtime) for the full runtime behavior, diff interactions, and optional preload.

### Theming the fallback surface

The stable `PreCodeNode` fallback (shown while content streams, and used when no enhanced runtime is installed) is themed through the shared `--code-*` tokens — `--code-bg`, `--code-fg`, `--code-border`, `--code-header-bg`, `--code-action-fg`, `--code-line-number`, etc. These tokens are the single theming channel across all framework adapters (vue / vue2 / react / svelte / angular / octane): override them to restyle the fallback surface. The enhanced surface is painted by its own runtime theme and is not affected by `--code-*` overrides.

### Language icon lazy loading

To keep the main bundle smaller, infrequent language icons are split into an async chunk:

- Common languages (JS/TS/HTML/CSS/JSON/Python/etc.) stay in the main bundle.
- Rare languages load on demand and will update icon output automatically after the async chunk resolves.
- If you prefer to avoid first-hit fallback icons, preload once during app idle:

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

## Fallback

If you don't install `stream-diffs`, the code block loader returns `null` and the renderer falls back to a simple `pre`/`code` representation. The fallback still shows line numbers and follows the `--code-*` theming tokens.

## Links & further reading

- Worker / SSR guidance: [/nuxt-ssr](/nuxt-ssr)
- Installation notes: [/guide/installation](/guide/installation)

Try this — simple CodeBlock render:

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode
    :node="node"
    :code-block-options="{ overflow: 'wrap', disableLineNumbers: true }"
  />
</template>
```
