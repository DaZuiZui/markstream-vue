# markstream-vue 1.x To 2.x

Use this reference only when an application already uses `markstream-vue` 1.x. It is not a Vue 2 to Vue 3 guide, and it is not a reason to replace unrelated application code.

`markstream-vue` 2.x removes the Monaco and `stream-markdown` code-block runtimes. `stream-diffs` is the only optional enhanced code-block surface. Without it, fenced code renders as plain `<pre><code>`. Normal Markdown, Mermaid, KaTeX, D2, Infographic, HTML-policy, worker, CSS, streaming, and virtualization APIs remain available.

## Audit Before Changing Dependencies

Record the exact installed version and search the manifest, lockfile, source, tests, and build configuration for:

- `stream-monaco`, `stream-markdown`, and `stream-diffs`
- `codeRenderer`, `markdownCodeRenderer`, `NodeRendererCodeRenderer`, `renderCodeBlocksAsPre`, and top-level `langs`
- `monacoOptions`, `codeBlockMonacoOptions`, and `CodeBlockMonaco*`
- `MarkdownCodeBlockNode`, `MarkdownCodeBlockNodeProps`, `MarkdownCodeBlockPreviewPayload`, and `ShikiCodeBlockProps`
- `resolveMonacoLanguageId`, `getUseMonaco`, and exported `Monaco*` runtime types
- `InternalParseOptions` and direct imports from `stream-markdown-parser`
- preview listeners such as `@preview-code` and adapter callbacks such as `onHandleArtifactClick`

Do not begin with a broad refactor. Capture the current typecheck, build, code-fence, preview, and SSR behavior so the migration has a concrete comparison.

## Install The Target Release

Before editing the manifest, query the package registry for the target version and dist-tags. A repository manifest can be bumped before its package is published, and `next` can still point to a 1.x prerelease during that interval.

After the coordinated beta is published and `markstream-vue@next` resolves to the announced 2.x generation, install the Vue 3 adapter from `next`. After 2.x stable is published, use the maintained major:

```bash
# 2.x beta validation
pnpm remove stream-monaco stream-markdown
pnpm add markstream-vue@next

# after 2.x stable is published
pnpm add markstream-vue@2
```

Add `stream-diffs` only when the application needs enhanced File or Diff blocks:

```bash
pnpm add stream-diffs
```

Otherwise set `render-code-blocks-as-pre` when the application should always use the plain fallback. Use a scoped `setCustomComponents(customId, { code_block: MyCodeBlock })` mapping when the application owns the renderer. Adapt the commands to the repository's package manager and preserve its lockfile policy.

### Coordinated beta family

The following versions are the declared `2.0.0-beta.1` package-family targets. They are install instructions only after those exact versions are published and each `next` tag resolves to the matching generation. Install only the adapter used by the application, plus `stream-diffs` when enhanced code blocks are required. Install parser or core directly only when application code imports them itself.

| Framework or layer | Coordinated version | Beta install |
| --- | --- | --- |
| Vue 3, Nuxt, or VitePress | `markstream-vue@2.0.0-beta.1` | `pnpm add markstream-vue@next stream-diffs` |
| React or Next.js | `markstream-react@0.1.0-beta.1` | `pnpm add markstream-react@next stream-diffs` |
| Octane | `markstream-octane@0.1.0-beta.1` | `pnpm add markstream-octane@next octane@^0.1.21 stream-diffs` |
| Svelte 5 | `markstream-svelte@0.1.0-beta.1` | `pnpm add markstream-svelte@next svelte@^5 stream-diffs` |
| Angular | `markstream-angular@0.1.0-beta.1` | `pnpm add markstream-angular@next stream-diffs` |
| Vue 2 | `markstream-vue2@0.1.0-beta.1` | `pnpm add markstream-vue2@next stream-diffs` |
| Parser only | `stream-markdown-parser@1.2.5-beta.1` | `pnpm add stream-markdown-parser@next` |
| Streaming core only | `markstream-core@1.1.0-beta.1` | `pnpm add markstream-core@next` |

Keep the package family on one prerelease generation. Verify the selected adapter's framework peers before installation: React requires both `react` and `react-dom` 18 or newer, Octane requires `octane@^0.1.21`, Svelte requires version 5, Angular requires `@angular/core` and `@angular/common` 20 or newer on the same Angular version line, and `markstream-vue2` requires Vue 2.6.14 or newer but below 3. Every Vue 2.6 consumer must install and register `@vue/composition-api`; Vue 2.7 has built-in Composition API support and must not install that plugin.

## Replace Removed APIs

| 1.x dependency or API | 2.x migration |
| --- | --- |
| `codeRenderer: 'monaco'`, `'shiki'`, or `'pre'` | Remove it. Enhanced blocks use `stream-diffs` automatically. Replace the old `'pre'` value with `renderCodeBlocksAsPre`; use `setCustomComponents(customId, { code_block: ... })` for a scoped custom renderer. |
| `markdownCodeRenderer` / `NodeRendererCodeRenderer` | Remove them. Timeline and virtual-adapter callers use `renderCodeBlocksAsPre: true` only when they require the plain path. |
| string `CodeBlockMonacoTheme` | string `CodeBlockTheme`; use `CodeBlockThemePair` for `{ dark, light }` selection. |
| Monaco JSON theme object / `CodeBlockMonacoThemeObject` | No direct conversion. Translate it to a Shiki `ThemeRegistration`, register it with `registerCustomTheme(name, loader)` from `stream-diffs/pierre`, then pass the registered name. |
| `CodeBlockMonacoLanguage` | Remove it. Fence languages are normalized by `resolveLanguageId`. |
| `CodeBlockMonacoOptions` | `CodeBlockOptions` for the supported renderer-neutral fields. |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` used only for preload | `preloadCodeBlockRuntime` |
| `getUseMonaco` used for direct runtime calls | Import the advanced API directly from `stream-diffs`; Markstream does not expose its raw runtime module. |
| `MarkdownCodeBlockNode` | `CodeBlockNode`, or the plain fallback. Adapter-specific `MarkdownCodeBlockNodeProps` imports, where present, become `CodeBlockNodeProps`. |
| `ShikiCodeBlockProps` / top-level `langs` | Remove them. Keep `themes` when needed; language preload lists are no longer renderer props. |
| `MarkdownCodeBlockPreviewPayload` | `CodeBlockPreviewPayload`; update field access as described below. |
| Direct `CodeBlockNode.monacoOptions` | `CodeBlockNode.codeBlockOptions` |
| `MarkdownRender.codeBlockMonacoOptions` | top-level `MarkdownRender.codeBlockOptions` |
| `stream-monaco` / `stream-markdown` | Remove both dependencies. |
| `stream-diffs` | Optional peer for enhanced blocks; omit it for plain `<pre><code>`. |

In 1.x, direct `CodeBlockNode` usage accepted `monacoOptions`; `MarkdownRender` exposed `codeBlockMonacoOptions` as the wrapper-level forwarding prop. In 2.x both entry points use the same `codeBlockOptions` name, and every coordinated adapter exposes it on direct `CodeBlockNode` plus top-level `NodeRenderer` / `MarkdownRender`. Keep header and toolbar configuration in the separate `codeBlockProps` bag.

For Vue templates, the typical renderer change is:

```vue
<!-- 1.x -->
<MarkdownRender
  :content="content"
  code-renderer="monaco"
  :code-block-monaco-options="editorOptions"
/>

<!-- 2.x -->
<MarkdownRender
  :content="content"
  :is-dark="isDark"
  :code-block-options="codeBlockOptions"
  :themes="['vitesse-dark', 'vitesse-light']"
/>
```

Migrate only supported fields. Host-managed typography/layout includes `fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, and `tabSize`; supported File/FileDiff fields include `disableLineNumbers`, `overflow`, highlighter limits, diff layout/folding, interactions, selection callbacks, annotations, `onController`, and `workerManager`. Theme, content/language, stream state, the single header, mount/reveal timing, and disposal remain host-owned and take precedence. If 1.x used different top and bottom padding values, choose one symmetric pixel value during migration; the 2.x option cannot preserve asymmetric padding.

Map common old fields explicitly:

| 1.x option | 2.x option |
| --- | --- |
| `MAX_HEIGHT: number` | `maxHeight: number` in CSS pixels; convert string values explicitly. |
| `wordWrap: 'on'` / `'off'` | `overflow: 'wrap'` / `'scroll'`; choose manually for `wordWrapColumn` or `bounded`. |
| `renderSideBySide: true` / `false` | `diffStyle: 'split'` / `'unified'` |
| `diffUnchangedRegionStyle` | `hunkSeparators` |
| `diffHideUnchangedRegions` | Map `false` / `{ enabled: false }` to `expandUnchanged: true`, and `true` / `{ enabled: true }` to `expandUnchanged: false`. Use `parseDiffOptions.context`, `collapsedContextThreshold`, and `expansionLineCount` for the remaining behavior; tune them because there is no field-for-field conversion. The plain `<pre>` fallback path (`renderCodeBlocksAsPre` / no-peer fallback) still accepts `diffHideUnchangedRegions` on `PreCodeNode`. |

Theme values are registered names. Direct `CodeBlockNode.theme` accepts a string or `{ dark, light }`, while `themes` is the `[dark, light]` pair. Vue 3 keeps the old `darkTheme` / `lightTheme` props as deprecated aliases of `theme` (top-level `codeBlockDarkTheme` / `codeBlockLightTheme`); React and Octane use `darkTheme` / `lightTheme` as their active-name props. A former Monaco JSON object must first be converted to a Shiki `ThemeRegistration`; translate Monaco `rules` into Shiki `tokenColors` or `settings` before registering it:

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

Pass `themeName` after registration; never pass the former Monaco object directly. A generic `code_block` override applies to ordinary fences; Mermaid, D2, and Infographic use dedicated component keys and must be overridden separately when required.

### Preview payload

This payload migration applies only to code that directly used the removed `MarkdownCodeBlockNode` and its `MarkdownCodeBlockPreviewPayload`. Existing 1.x `CodeBlockNode` and `MarkdownRender` artifact handlers already used the common payload and do not need a shape rewrite.

`MarkdownCodeBlockPreviewPayload` is not a field-for-field type rename. Its handler read `{ type, content, title }`. `CodeBlockNode` emits `CodeBlockPreviewPayload`:

```ts
import type { CodeBlockPreviewPayload } from 'markstream-vue'

function handlePreview({ node, artifactType, artifactTitle, id }: CodeBlockPreviewPayload) {
  openArtifact({
    id,
    type: artifactType,
    content: node.code,
    title: artifactTitle,
  })
}
```

Update consumers to read rendered source from `node.code`. Across the coordinated adapters, the normalized artifact callback payload is `{ node, artifactType, artifactTitle, id }`. Custom React or Octane code-block components may still call their local `onPreviewCode` callback with optional `{ type, content, title }`; the adapter normalizes that into the common artifact payload and uses `content` as `node.code` when supplied.

### Low-level runtime access

Do not replace root-level `Monaco*` runtime imports with guessed `StreamDiffs*` imports from Markstream. Use `preloadCodeBlockRuntime()` when the old code only warmed the optional module. When an application intentionally owns a controller, import its functions and types directly from `stream-diffs` and own its lifecycle.

## Parser Types

`InternalParseOptions` is removed. Use the public `ParseOptions` contract from the adapter root, or from `stream-markdown-parser` when the application directly owns parser calls:

```ts
import type { ParseOptions } from 'markstream-vue'

const parseOptions: ParseOptions = {
  reuseStableTopLevelNodes: true,
}
```

The supported structured-reuse and timing fields are `reuseStableTopLevelNodes` and `parserMetrics`. Cursor, fragment, and stream-control fields remain internal and have no public replacement. Remove internal fields such as `__customHtmlBlockCursor`, `__disableStreamParse`, `__disableStructuredReuse`, and `__insideStrong` instead of copying them into application-owned parser options.

## Verification

1. Inspect the manifest and lockfile.
   - `stream-monaco` and `stream-markdown` are absent.
   - The selected adapter, directly imported parser or core, and lockfile resolve to one release family.
   - `stream-diffs` is present only when enhanced code blocks are intended.
2. Run the repository's package-manager install, typecheck, build, and focused renderer tests.
3. Exercise plain and enhanced code fences, including normal files and diffs, in light and dark themes.
   - Verify migrated `codeBlockOptions` on both direct and renderer-level paths.
   - Verify custom theme names were registered; do not pass old Monaco JSON objects as `theme`.
4. Verify inline and side-by-side diff behavior at the widths used by the application.
5. If the application migrated a direct `MarkdownCodeBlockNode` preview handler, trigger it and assert `{ node, artifactType, artifactTitle, id }`, including that the preview source is `node.code`. Confirm existing `CodeBlockNode` or `MarkdownRender` handlers retain that same shape.
6. Run SSR and packed-install checks for Nuxt, VitePress, Next.js, or another server renderer.
7. Recheck optional Mermaid, KaTeX, D2, Infographic, custom component, streaming, and virtualization behavior without changing their configuration unless a failure proves it is necessary.

## Rollback And 1.x Maintenance

Before upgrading, record the exact working 1.x version and retain the pre-migration lockfile. At the `2.0.0-beta.1` repository baseline, the last stable is `markstream-vue@1.0.9` and the preserved prerelease candidate is `markstream-vue@1.1.2-beta.3`. If validation fails, revert the dependency and source changes together; do not leave 2.x code using 1.x packages or restore only one removed runtime.

Use the maintained 1.x channels when a rollback must stay on that major:

| Intent | Install |
| --- | --- |
| Exact pre-cutover stable | `pnpm add markstream-vue@1.0.9` |
| Exact pre-cutover prerelease | `pnpm add markstream-vue@1.1.2-beta.3` |
| Latest maintained 1.x stable | `pnpm add markstream-vue@1` |
| Legacy stable alias after the 2.x stable cutover | `pnpm add markstream-vue@legacy` |
| Latest maintained 1.x prerelease after the beta cutover | `pnpm add markstream-vue@legacy-next` |

Applications pinned to `^1.x` remain on the 1.x line. Do not assume that `legacy` or `legacy-next` exists before its corresponding release cutover; use an exact known-good version or `@1` before then. After the beta cutover, `next` belongs to 2.x while `latest` still belongs to 1.x. After the stable cutover, both `latest` and `next` belong to 2.x; use `@1`, `legacy`, or `legacy-next` for the maintained 1.x line.
