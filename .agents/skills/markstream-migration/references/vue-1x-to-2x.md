# markstream-vue 1.x To 2.x

Use this reference only when an application already uses `markstream-vue` 1.x. It is not a Vue 2 to Vue 3 guide, and it is not a reason to replace unrelated application code.

`markstream-vue` 2.x removes the Monaco and `stream-markdown` code-block runtimes. `stream-diffs` is the only optional enhanced code-block surface. Without it, fenced code renders as plain `<pre><code>`. Normal Markdown, Mermaid, KaTeX, D2, Infographic, HTML-policy, worker, CSS, streaming, and virtualization APIs remain available.

## Audit Before Changing Dependencies

Record the exact installed version and search the manifest, lockfile, source, tests, and build configuration for:

- `stream-monaco`, `stream-markdown`, and `stream-diffs`
- `codeRenderer`, `renderCodeBlocksAsPre`, and top-level `langs`
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

Otherwise set `code-renderer="pre"` or `render-code-blocks-as-pre` explicitly when the application should always use the plain fallback. Adapt the commands to the repository's package manager and preserve its lockfile policy.

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
| `codeRenderer: 'monaco'` or `'shiki'` | Use `'stream-diffs'` for enhanced blocks or `'pre'` for the plain fallback. |
| `CodeBlockMonacoTheme` / `CodeBlockMonacoThemeObject` | `CodeBlockTheme` / `CodeBlockThemeObject` |
| `CodeBlockMonacoLanguage` | Remove it. Fence languages are normalized by `resolveLanguageId`. |
| `CodeBlockMonacoOptions` | Remove it. There is no public editor-options replacement. |
| `resolveMonacoLanguageId` | `resolveLanguageId` |
| `getUseMonaco` | `getStreamDiffsRuntime` |
| `MarkdownCodeBlockNode` | `CodeBlockNode`, or the plain fallback. Adapter-specific `MarkdownCodeBlockNodeProps` imports, where present, become `CodeBlockNodeProps`. |
| `ShikiCodeBlockProps` / top-level `langs` | Remove them. Keep `themes` when needed; language preload lists are no longer renderer props. |
| `MarkdownCodeBlockPreviewPayload` | `CodeBlockPreviewPayload`; update field access as described below. |
| `monacoOptions` / `codeBlockMonacoOptions` | Remove them. There is no adapter-options replacement. |
| `stream-monaco` / `stream-markdown` | Remove both dependencies. |
| `stream-diffs` | Optional peer for enhanced blocks; omit it for plain `<pre><code>`. |

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
  code-renderer="stream-diffs"
  :is-dark="isDark"
  :themes="['vitesse-dark', 'vitesse-light']"
/>
```

Theme selection remains public. Low-level sizing, wrapping, diff-algorithm, and adapter CSS options are no longer renderer props.

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

### Low-level runtime types

These public runtime types follow the runtime rename. They describe the `stream-diffs` adapter boundary and do not restore removed editor options.

| 1.x type | 2.x type |
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
