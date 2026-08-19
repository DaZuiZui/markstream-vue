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

Markstream 2.0 is published as stable: `markstream-vue` on `latest` and `markstream-vue@2` both select the maintained 2.x line. The 1.x line stays available through `legacy` / `legacy-next` (`markstream-vue@1`).

```bash
# 2.0 stable (latest); stream-diffs is the enhanced code-block runtime
pnpm add markstream-vue stream-diffs

# explicit 2.x line
pnpm add markstream-vue@2 stream-diffs

# 1.x maintenance line
pnpm add markstream-vue@1
```

Without `stream-diffs`, code fences render as a plain `<pre><code>` fallback. You can request that path explicitly with `render-code-blocks-as-pre`.

### Coordinated 2.0 family

The same code-block migration applies to every framework adapter. The packages publish independently, so before using one of the rows below, confirm it is on the 2.0 line:

```bash
# Replace this name with the package from the row you use.
PACKAGE=markstream-react
npm view "$PACKAGE" version
```

Install the adapter you use from `latest`; install parser or core directly only when your application imports them itself.

| Framework or layer | 2.0 version | Install |
| --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue@2.0.0` | `pnpm add markstream-vue stream-diffs` |
| React / Next.js | `markstream-react@2.0.0` | `pnpm add markstream-react stream-diffs` |
| Octane | `markstream-octane@2.0.0` | `pnpm add markstream-octane octane@^0.1.21 stream-diffs` |
| Svelte 5 | `markstream-svelte@2.0.0` | `pnpm add markstream-svelte svelte@^5 stream-diffs` |
| Angular | `markstream-angular@2.0.0` | `pnpm add markstream-angular stream-diffs` |
| Vue 2 | `markstream-vue2@2.0.0` | `pnpm add markstream-vue2 stream-diffs` |
| Parser only | `stream-markdown-parser@1.2.8` | `pnpm add stream-markdown-parser` |
| Streaming core only | `markstream-core@2.0.0` | `pnpm add markstream-core` |

Keep existing framework peers compatible instead of upgrading only part of a framework. React requires both `react` and `react-dom` 18 or newer. Keep all Angular packages on one version line. Vue 2.6 users must also install and register `@vue/composition-api`; Vue 2.7 users must not install that plugin.

## Breaking code-block changes

| 1.x API or dependency | 2.0 migration |
| --- | --- |
| `codeRenderer: 'monaco'`, `'shiki'`, or `'pre'` | Remove it. Enhanced blocks use `stream-diffs` automatically. Replace the old `'pre'` value with `renderCodeBlocksAsPre`; use `setCustomComponents(customId, { code_block: ... })` for a scoped custom renderer. |
| `markdownCodeRenderer` / `NodeRendererCodeRenderer` | Remove them. Timeline and virtual-adapter callers that require plain output should set `renderCodeBlocksAsPre: true`; the enhanced path needs no selector. |
| `CodeBlockMonacoTheme` string | `CodeBlockTheme` string. A light/dark selection can use `CodeBlockThemePair` (`{ dark, light }`). |
| Monaco JSON theme object / `CodeBlockMonacoThemeObject` | No direct conversion. Translate it to a Shiki `ThemeRegistration`, register it with `registerCustomTheme(name, loader)` from `stream-diffs/pierre`, then pass the registered name. |
| `CodeBlockMonacoLanguage` | Remove it. Language identifiers now come from the code fence and are normalized by `resolveLanguageId`. |
| `CodeBlockMonacoOptions` | `CodeBlockOptions` for the supported renderer-neutral fields. |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` used only for preload | `preloadCodeBlockRuntime` |
| `getUseMonaco` used to call the runtime directly | Import the advanced API from `stream-diffs`; Markstream does not expose its raw runtime module. |
| `MarkdownCodeBlockNode` and the React / Octane `MarkdownCodeBlockNodeProps` export | `CodeBlockNode` / `CodeBlockNodeProps`, or the plain `pre` fallback |
| `ShikiCodeBlockProps` / top-level `langs` | Remove them. Keep `themes` when needed; language preload lists are no longer renderer props. |
| `MarkdownCodeBlockPreviewPayload` | `CodeBlockPreviewPayload`; update the handler shape as shown below. |
| Direct `CodeBlockNode.monacoOptions` | `CodeBlockNode.codeBlockOptions` |
| `MarkdownRender.codeBlockMonacoOptions` | Top-level `MarkdownRender.codeBlockOptions` |
| `stream-monaco` / `stream-markdown` | Remove both dependencies. |
| `stream-diffs` | Optional peer for enhanced code blocks. |

In 1.x, a directly mounted `CodeBlockNode` accepted `monacoOptions`, while `MarkdownRender` exposed `codeBlockMonacoOptions` to forward that configuration. In 2.0 both entry points use the same renderer-neutral name: `codeBlockOptions`. Every coordinated adapter exposes it on its direct `CodeBlockNode` and as a top-level `NodeRenderer` / `MarkdownRender` prop. `codeBlockProps` remains the separate bag for component chrome such as header and toolbar controls.

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
  :is-dark="isDark"
  :code-block-options="codeBlockOptions"
  :themes="['vitesse-dark', 'vitesse-light']"
/>
```

`CodeBlockOptions` includes host-managed typography and layout (`fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, `tabSize`) plus supported `stream-diffs` options such as `disableLineNumbers`, `overflow`, highlighting limits, diff layout and folding, line/token interactions, annotations, selection callbacks, `onController`, and `workerManager`. Markstream still owns theme selection, language and streamed content, its single header, mounting/reveal timing, and disposal; conflicting raw runtime keys cannot override those host responsibilities. If 1.x used different top and bottom padding values, choose one symmetric pixel value during migration; 2.0 cannot preserve asymmetric padding through `codeBlockOptions`.

Common option migrations are not field-for-field renames:

| 1.x option | 2.0 option |
| --- | --- |
| `MAX_HEIGHT: number` | `maxHeight: number` in CSS pixels. Convert string values explicitly. |
| `wordWrap: 'on'` / `'off'` | `overflow: 'wrap'` / `'scroll'`. Choose one of those behaviors manually for `wordWrapColumn` or `bounded`. |
| `renderSideBySide: true` / `false` | `diffStyle: 'split'` / `'unified'` |
| `diffUnchangedRegionStyle` | `hunkSeparators` |
| `diffHideUnchangedRegions` | There is no single replacement object on the enhanced `stream-diffs` path. Map `false` / `{ enabled: false }` to `expandUnchanged: true`, and `true` / `{ enabled: true }` to `expandUnchanged: false`. Use `parseDiffOptions.context` for surrounding context, `collapsedContextThreshold` for when a region collapses, and `expansionLineCount` for reveal size. Tune the thresholds because the old and new algorithms are not identical. The plain `<pre>` fallback path (`renderCodeBlocksAsPre` and no-peer fallback) keeps `diffHideUnchangedRegions` on `PreCodeNode` unchanged. |

Theme values are names, not Monaco theme JSON. In Vue 3, Svelte, Angular, and Vue 2, `CodeBlockNode.theme` accepts a fixed string or `{ dark, light }`. React and Octane use `darkTheme` / `lightTheme` for the active names. In Vue 3 the old `CodeBlockNode.darkTheme` / `lightTheme` props are kept as deprecated aliases of `theme` and still work; they are forwarded from the top level as `codeBlockDarkTheme` / `codeBlockLightTheme` and will be removed in a future major. In every adapter, `themes` is the `[dark, light]` name pair used for loading. Convert an old Monaco theme to Shiki's theme format before registering it; in particular, Monaco `rules` are not Shiki token rules and must be translated to `tokenColors` or `settings`:

```ts
import type { ThemeRegistration } from 'stream-diffs/pierre'
import { registerCustomTheme } from 'stream-diffs/pierre'

const themeName = 'acme-dark'
const acmeDark: ThemeRegistration = {
  name: themeName,
  type: 'dark',
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#c9d1d9',
  },
  tokenColors: [
    {
      scope: ['comment'],
      settings: { foreground: '#8b949e', fontStyle: 'italic' },
    },
  ],
}

registerCustomTheme(themeName, async () => acmeDark)
```

Pass `themeName` after registration. Do not pass the former Monaco object directly. The built-in `CodeBlockNode` is automatic; use a scoped `setCustomComponents(customId, { code_block: MyCodeBlock })` mapping when the application owns the renderer. Mermaid, D2, and Infographic fences use their dedicated component keys and must be overridden separately when needed.

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

### Low-level runtime access

The old root-level `Monaco*` runtime types and `getUseMonaco` are not renamed into a second public copy of the `stream-diffs` API. Use `preloadCodeBlockRuntime()` when the application only needs to warm Markstream's optional code-block module. Advanced applications that intentionally own a runtime controller should import its functions and types directly from `stream-diffs` and manage that controller's lifecycle themselves.

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

The 2.x stable cutover is live: `markstream-vue` / `markstream-core` 2.x are on `latest`, 1.x stable is preserved on `legacy`, and `legacy-next` carries 1.x prereleases.

| Release phase | `latest` | `next` | Maintained 1.x channels |
| --- | --- | --- | --- |
| Before the 2.x beta cutover | 1.x stable | 1.x prerelease | `markstream-vue@1` or an exact version |
| After beta, before stable | 1.x stable | 2.x beta | `markstream-vue@1` for stable; `markstream-vue@legacy-next` for prereleases |
| After the 2.x stable cutover | 2.x stable | 2.x prerelease | `markstream-vue@1` or `@legacy` for stable; `@legacy-next` for prereleases |

Applications already pinned to `^1.x` stay on the 1.x line. The beta cutover moves only the prerelease channel; 1.x stable patches can continue updating `latest` until the stable 2.x cutover. After stable 2.x takes `latest`, subsequent 1.x stable releases go to `legacy`.

## Verification checklist

- Remove `stream-monaco`, `stream-markdown`, and the old code-block prop names.
- Rename supported `monacoOptions` / `codeBlockMonacoOptions` fields to `codeBlockOptions` and review unsupported Monaco-only fields instead of copying them blindly.
- Add `stream-diffs` if enhanced code blocks are required.
- Exercise normal and diff fences in light and dark themes.
- Verify inline and side-by-side diffs at the widths used by your application.
- Run SSR and packed-install checks if your application uses Nuxt, VitePress, or a server renderer.

See the [2.0 roadmap](/guide/roadmap-2-0) for repository-level release gates.
