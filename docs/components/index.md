---
title: 'Component gallery'
description: 'Live-rendered gallery of every Markstream node component — basic blocks, code, math and diagrams, media, inline typography, and the customization API. Filter by category or search by name.'
keywords:
  - markstream components
  - component gallery
  - markdown node components
  - mermaid component
  - katex component
  - streaming code block component
---

# Component gallery

<script setup>
import ComponentGallery from '../.vitepress/theme/ComponentGallery.vue'
</script>

Every card below is a **live render** produced by `markstream-vue` — what you see is what your users get. Filter by category, search by name or keyword, then click a card for the component page with copyable markdown, override notes, and related components.

<ComponentGallery />

## Using a component

1. Copy the markdown input from a component page.
2. Render it with `MarkdownRender`:

```vue
<script setup>
import { MarkdownRender } from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

3. Components marked with a **peer** badge need their optional peer dependency installed first — see [Installation & Optional Peers](/guide/installation).
4. Want a different look? Almost every node can be replaced safely — see [Override Built-in Components](/guide/component-overrides).

::: tip Streaming by default
These previews render exactly the same while content streams in token by token. Unclosed syntax stays stable instead of flickering — that is the core of Markstream.
:::
