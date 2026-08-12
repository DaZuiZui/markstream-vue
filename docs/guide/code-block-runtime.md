---
title: Code Block Runtime
description: How the optional stream-diffs runtime powers CodeBlockNode with minimal installation, replacing the historical Monaco editor surface.
keywords:
  - code block runtime
  - stream-diffs runtime
  - runtime preload
  - code editor surface
---
# Code Block Runtime

This page documents the optional `stream-diffs` runtime used by `CodeBlockNode`. In 2.0 the `stream-monaco` fallback is removed and `stream-diffs` is the only enhanced code-block surface. Supported configuration is exposed through the renderer-neutral `CodeBlockOptions` API.

## Install

```bash
pnpm add stream-diffs
```

No worker plugin or package-specific CSS import is required.

If `stream-diffs` is not installed, the loader keeps the `<pre>` fallback and renders the code block without an enhanced surface.

## Runtime boundary

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - streaming completion                 - code or diff data
  - viewport decision                    - File / FileDiff rendering
  - header and toolbar                   - syntax highlighting
```

The `stream-diffs` root entry is framework-agnostic. It does not import Vue or own a Vue lifecycle. The package also exposes an optional `stream-diffs/vue` convenience entry for direct Vue consumers, but `markstream-vue` does not use that entry.

## CodeBlockNode handoff

`CodeBlockNode` uses one stable visual path:

1. While code is streaming, Vue renders the shared `PreCodeBlock`; `renderCodeBlocksAsPre` uses the same component and resolved visual defaults.
2. After the block is complete and visible, the component dynamically imports the `stream-diffs` root runtime and mounts one File or FileDiff surface into its existing container.
3. The component applies the active theme to that surface and removes the temporary `<pre>` only when the surface is ready. Before reveal, both surfaces already share font metrics, padding, gutter geometry, overflow, and theme background; a streaming plain block never inherits a stale restored-height floor.
4. On component unmount, the Vue adapter disposes the controller.

Completion, visibility, and unmount are `CodeBlockNode` concerns. They are not `stream-diffs` lifecycle hooks.

`CodeBlockShell` owns the title and action bar. The File surface is created with its internal `data-diffs-header` disabled so the DOM has one header.

## Theming

Use `theme` with either a registered string name or `{ dark, light }`. The `themes` prop is the `[dark, light]` name pair available to the runtime. `CodeBlockNode` sends theme changes to its mounted surface without recreating the Vue component.

Monaco JSON theme objects are not renamed into the 2.0 API. Use `registerCustomTheme` from `stream-diffs/pierre`, then pass the registered name.

## Options handoff

Direct `CodeBlockNode` usage and the top-level `NodeRenderer` / `MarkdownRender` API both accept `codeBlockOptions`. The same `CodeBlockOptions` contract is available across Vue 3, React, Octane, Svelte, Angular, and Vue 2.

The supported surface includes:

- host-managed typography and layout: `fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, and `tabSize`;
- File options such as `disableLineNumbers`, `overflow`, highlighting limits, and virtualization/highlighter controls;
- FileDiff layout, indicators, unchanged-region folding, and line-diff controls;
- line/token interactions, selection callbacks, annotations, `onController`, and `workerManager`.

Markstream applies the host-managed fields to both the streaming `<pre>` and finalized surface, then forwards the remaining supported fields to `stream-diffs`. Theme, language/content, streaming state, the single header, mount/reveal timing, and disposal remain host-owned and take precedence over conflicting runtime values.

## Optional preload

If a route is known to contain completed, visible code blocks, preload the module during idle time:

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

This only warms the optional module. It does not create a surface, finalize a streaming block, or bypass the completion-and-visibility gate.

## Diff interactions

Diff blocks keep the same adapter boundary. The enhanced diff surface uses `stream-diffs` defaults unless the corresponding `codeBlockOptions` fields are supplied. For example, `diffStyle`, `expandUnchanged`, `collapsedContextThreshold`, `hunkSeparators`, `lineDiffType`, and `parseDiffOptions` configure layout and folding.
