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

The live documentation may be deployed before the beta reaches npm. Check the `next` tag first, and run the beta install only when it returns `2.0.0-beta.1`. After the stable release, `@2` selects the maintained 2.x line:

```bash
# Continue only when this prints 2.0.0-beta.1
npm view markstream-vue@next version

# 2.0 beta validation, after the check above passes
pnpm add markstream-vue@next stream-diffs

# after 2.0 stable is published
pnpm add markstream-vue@2 stream-diffs
```

Without `stream-diffs`, code fences render as a plain `<pre><code>` fallback. You can request that path explicitly with `render-code-blocks-as-pre`.

### Coordinated beta family

The same code-block migration applies to every framework adapter in the coordinated beta. The packages publish independently, so checking `markstream-vue@next` does not prove that another adapter is ready. Before running a row below, query that row's package and confirm that it exactly matches the listed beta version:

```bash
# Replace this name with the package from the row you use.
PACKAGE=markstream-react
npm view "$PACKAGE@next" version
```

Install the adapter you use from `next`; install parser or core directly only when your application imports them itself.

| Framework or layer | Beta version | Beta install |
| --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue@2.0.0-beta.1` | `pnpm add markstream-vue@next stream-diffs` |
| React / Next.js | `markstream-react@0.1.0-beta.1` | `pnpm add markstream-react@next stream-diffs` |
| Octane | `markstream-octane@0.1.0-beta.1` | `pnpm add markstream-octane@next octane@^0.1.21 stream-diffs` |
| Svelte 5 | `markstream-svelte@0.1.0-beta.1` | `pnpm add markstream-svelte@next svelte@^5 stream-diffs` |
| Angular | `markstream-angular@0.1.0-beta.1` | `pnpm add markstream-angular@next stream-diffs` |
| Vue 2 | `markstream-vue2@0.1.0-beta.1` | `pnpm add markstream-vue2@next stream-diffs` |
| Parser only | `stream-markdown-parser@1.2.5-beta.1` | `pnpm add stream-markdown-parser@next` |
| Streaming core only | `markstream-core@1.1.0-beta.1` | `pnpm add markstream-core@next` |

Keep existing framework peers compatible instead of upgrading only part of a framework. React requires both `react` and `react-dom` 18 or newer. Keep all Angular packages on one version line. Vue 2.6 users must also install and register `@vue/composition-api`; Vue 2.7 users must not install that plugin.

## Breaking code-block changes

| 1.x API or dependency | 2.0 migration |
| --- | --- |
| `codeRenderer: 'monaco'` or `'shiki'` | Use `codeRenderer: 'stream-diffs'` to keep enhanced blocks, or `'pre'` for the plain fallback. |
| `CodeBlockMonacoTheme` / `CodeBlockMonacoThemeObject` | `CodeBlockTheme` / `CodeBlockThemeObject` |
| `CodeBlockMonacoLanguage` | Remove it. Language identifiers now come from the code fence and are normalized by `resolveLanguageId`. |
| `CodeBlockMonacoOptions` | Remove it. There is no public editor-options replacement. |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` | `getStreamDiffsRuntime` |
| `MarkdownCodeBlockNode` and the React / Octane `MarkdownCodeBlockNodeProps` export | `CodeBlockNode` / `CodeBlockNodeProps`, or the plain `pre` fallback |
| `ShikiCodeBlockProps` / top-level `langs` | Remove them. Keep `themes` when needed; language preload lists are no longer renderer props. |
| `MarkdownCodeBlockPreviewPayload` | `CodeBlockPreviewPayload`; update the handler shape as shown below. |
| `monacoOptions` / `codeBlockMonacoOptions` | Remove them. There is no adapter-options replacement. |
| `stream-monaco` / `stream-markdown` | Remove both dependencies. |
| `stream-diffs` | Optional peer for enhanced code blocks. |

Before:

```vue
<MarkdownRender
  :content="content"
  code-renderer="monaco"
  :code-block-monaco-options="editorOptions"
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

### Preview event payload

`MarkdownCodeBlockPreviewPayload` is not a type-only rename. A handler attached to the removed `MarkdownCodeBlockNode` previously received the rendered content directly:

```ts
import type { MarkdownCodeBlockPreviewPayload } from 'markstream-vue'

function handlePreview({ type, content, title }: MarkdownCodeBlockPreviewPayload) {
  openArtifact({ type, content, title })
}
```

`CodeBlockNode` now emits `CodeBlockPreviewPayload`. Read the source from `node.code` and use the explicit artifact fields:

```ts
import type { CodeBlockPreviewPayload } from 'markstream-vue'

function handlePreview({ node, artifactType, artifactTitle, id }: CodeBlockPreviewPayload) {
  openArtifact({ id, type: artifactType, content: node.code, title: artifactTitle })
}
```

### Low-level runtime type renames

These root exports follow the runtime rename. They describe the `stream-diffs` adapter surface; they do not restore the removed renderer options.

| 1.x type | 2.0 type |
| --- | --- |
| `MonacoDiffEditorViewLike` | `StreamDiffsDiffEditorViewLike` |
| `MonacoDiffLineChangeLike` | `StreamDiffsDiffLineChangeLike` |
| `MonacoDisposableLike` | `StreamDiffsDisposableLike` |
| `MonacoEditorViewLike` | `StreamDiffsEditorViewLike` |
| `MonacoHelpers` | `StreamDiffsHelpers` |
| `MonacoModelLike` | `StreamDiffsModelLike` |
| `MonacoModule` | `StreamDiffsModule` |
| `MonacoNamespaceLike` | `StreamDiffsNamespaceLike` |
| `MonacoRuntimeOptions` | `StreamDiffsRuntimeOptions` |

## Parser types

Use `ParseOptions` for public parser configuration. `InternalParseOptions` is removed. The supported structured-reuse and timing fields are `reuseStableTopLevelNodes` and `parserMetrics`; cursor, fragment, and stream-control fields remain internal.

```ts
import type { ParseOptions } from 'markstream-vue'

const parseOptions: ParseOptions = {
  reuseStableTopLevelNodes: true,
}
```

## 1.x maintenance and npm channels

The `1.x` branch remains available for critical bug and security fixes. Fixes that apply to both lines land on the current line first and are cherry-picked to `1.x`; fixes tied to removed 1.x code stay on that branch. No 1.x end-of-life date is set here; it will be announced separately.

| Release phase | `latest` | `next` | Maintained 1.x channels |
| --- | --- | --- | --- |
| Before the 2.x beta cutover | 1.x stable | 1.x prerelease | `markstream-vue@1` or an exact version |
| After beta, before stable | 1.x stable | 2.x beta | `markstream-vue@1` for stable; `markstream-vue@legacy-next` for prereleases |
| After the 2.x stable cutover | 2.x stable | 2.x prerelease | `markstream-vue@1` or `@legacy` for stable; `@legacy-next` for prereleases |

Applications already pinned to `^1.x` stay on the 1.x line. The beta cutover moves only the prerelease channel; 1.x stable patches can continue updating `latest` until the stable 2.x cutover. After stable 2.x takes `latest`, subsequent 1.x stable releases go to `legacy`.

## Verification checklist

- Remove `stream-monaco`, `stream-markdown`, and removed code-block props.
- Add `stream-diffs` if enhanced code blocks are required.
- Exercise normal and diff fences in light and dark themes.
- Verify inline and side-by-side diffs at the widths used by your application.
- Run SSR and packed-install checks if your application uses Nuxt, VitePress, or a server renderer.

See the [2.0 roadmap](/guide/roadmap-2-0) for repository-level release gates.
