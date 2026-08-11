---
title: Migrating to 2.0
description: Upgrade markstream-vue 1.x applications to 2.0, replace Monaco and stream-markdown code blocks with stream-diffs, and understand the 1.x maintenance channels.
keywords:
  - markstream 2.0 migration
  - stream-diffs migration
  - remove Monaco
  - markstream legacy release
---

# Migrating to 2.0

`markstream-vue@2.0` removes the two former code-block runtimes and uses `stream-diffs` as its only enhanced code-block surface. The normal Markdown, Mermaid, KaTeX, D2, Infographic, HTML-policy, worker, CSS, and virtualization APIs remain available.

## Install

Install the beta from `next`. After the stable release, `@2` selects the maintained 2.x line:

```bash
# 2.0 beta validation
pnpm add markstream-vue@next stream-diffs

# after 2.0 stable is published
pnpm add markstream-vue@2 stream-diffs
```

Without `stream-diffs`, code fences render as a plain `<pre><code>` fallback. You can request that path explicitly with `render-code-blocks-as-pre`.

## Breaking code-block changes

| 1.x API or dependency | 2.0 migration |
| --- | --- |
| `codeRenderer: 'monaco'`, `'shiki'`, or `'markdown'` | Use `codeRenderer: 'stream-diffs'` to keep enhanced blocks, or `'pre'` for the plain fallback. |
| `CodeBlockMonacoTheme` / `CodeBlockMonacoThemeObject` | `CodeBlockTheme` / `CodeBlockThemeObject` |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` | `getStreamDiffsRuntime` |
| `MarkdownCodeBlockNode` | `CodeBlockNode`, or the plain `pre` fallback |
| `monacoOptions` / `codeBlockMonacoOptions` | Remove them. There is no adapter-options replacement. |
| `stream-monaco` / `stream-markdown` | Remove both dependencies. |
| `stream-diffs` | Optional peer for enhanced code blocks. |

Before:

```vue
<MarkdownRender
  :content="content"
  code-renderer="monaco"
  :monaco-options="editorOptions"
/>
```

After:

```vue
<MarkdownRender
  :content="content"
  code-renderer="stream-diffs"
  :is-dark="isDark"
  :themes="['vitesse-dark', 'vitesse-light']"
/>
```

Theme selection remains public. Low-level editor sizing, wrapping, diff-algorithm, and adapter CSS options are no longer renderer props.

## Parser types

Use `ParseOptions` for public parser configuration. `InternalParseOptions` is removed. The supported structured-reuse and timing fields are `reuseStableTopLevelNodes` and `parserMetrics`; cursor, fragment, and stream-control fields remain internal.

```ts
import type { ParseOptions } from 'stream-markdown-parser'

const parseOptions: ParseOptions = {
  reuseStableTopLevelNodes: true,
}
```

## 1.x maintenance and npm channels

The `1.x` branch remains available for critical bug and security fixes. Fixes that apply to both lines land on the current line first and are cherry-picked to `1.x`; fixes tied to removed 1.x code stay on that branch. No 1.x end-of-life date is set here; it will be announced separately.

| Install intent | Command or dist-tag |
| --- | --- |
| Current stable major | `pnpm add markstream-vue` or `@latest` |
| Current prerelease | `pnpm add markstream-vue@next` |
| Latest maintained 1.x stable | `pnpm add markstream-vue@1`; `@legacy` is also available after the stable 2.0 cutover |
| Latest maintained 1.x prerelease | `pnpm add markstream-vue@legacy-next` after the first 2.x beta cutover |

Applications already pinned to `^1.x` stay on the 1.x line. The release workflow routes later 1.x publications to the legacy tags so they cannot move `latest` or `next` back from 2.x.

## Verification checklist

- Remove `stream-monaco`, `stream-markdown`, and removed code-block props.
- Add `stream-diffs` if enhanced code blocks are required.
- Exercise normal and diff fences in light and dark themes.
- Verify inline and side-by-side diffs at the widths used by your application.
- Run SSR and packed-install checks if your application uses Nuxt, VitePress, or a server renderer.

See the [2.0 roadmap](/guide/roadmap-2-0) for repository-level release gates.
