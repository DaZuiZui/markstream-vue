---
title: Code Block Runtime Internals
description: How markstream-vue connects CodeBlockNode to the framework-agnostic stream-diffs root runtime through cached dynamic imports.
keywords:
  - code block internals
  - stream-diffs runtime
  - dynamic import adapter
  - framework-agnostic surface
---
# Code Block Runtime Internals

This legacy route describes how markstream-vue connects `CodeBlockNode` to the framework-agnostic `stream-diffs` root runtime.

## Loading contract

Markstream uses an internal cached loader that dynamically imports `stream-diffs`, not `stream-diffs/vue`. The adapter exposes only the small surface that `CodeBlockNode` needs: create, update, theme, measure, and dispose. The raw loader/module is intentionally not part of Markstream's public API.

```text
CodeBlockNode                 markstream-vue runtime                stream-diffs
-------------                 ----------------------                ------------
Vue state and viewport   ->   cached dynamic import             ->   DOM controller
component unmount        ->   controller cleanup                ->   surface dispose
```

The import is cached while it is in flight. A failed load leaves the code block on its `<pre>` representation; a later block can retry the optional import.

## Finalization contract

The controller receives a plain `HTMLElement` plus code or diff strings. It has no knowledge of Vue props, watchers, component instances, or unmount hooks.

`CodeBlockNode` owns this policy:

1. Keep the fallback visible during streaming.
2. Wait for completion and viewport eligibility.
3. Create one static File or FileDiff surface using `stream: false`.
4. Apply the active theme and reveal the surface only after its first render.
5. Dispose it when the Vue component unmounts or changes identity.

The fallback and enhanced surface share one visual handoff contract. The fallback uses the same resolved theme palette and code metrics as the enhanced surface; without explicit theme overrides, `isDark` selects `vitesse-dark` or `vitesse-light`. During enhancement, both layers occupy the same grid row, and `CodeBlockNode` removes the fallback in the same Vue patch that reveals the ready surface. There must be no intermediate blank frame, stacked-height frame, background change, or geometry change.

`renderCodeBlocksAsPre` and an unavailable enhanced runtime both render the same shared `PreCodeBlock` component used by `CodeBlockNode` during enhancement. Their default line numbers, code font, font size, line height, four-edge padding, tab size, foreground, and background therefore follow one contract rather than parallel CSS implementations.

This keeps high-frequency streaming updates out of the syntax-highlighting surface and gives each finalized block a single controller lifetime.

## Preload

`preloadCodeBlockRuntime()` is an optional module warm-up. It does not mount a code block or override the completion/visibility policy.

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

This is the public replacement when historical `getUseMonaco` usage only warmed the code-block runtime. Advanced code that intentionally owns a controller should import the API and types directly from `stream-diffs` instead of depending on Markstream's internal adapter.

## Themes

Theme changes are sent to the mounted `stream-diffs` surface. Theme application is scoped to that surface, so one code block does not change another block through a global runtime mutation.

## Disposal

The Vue adapter calls `cleanupEditor()` when a code block unmounts or is replaced. The controller releases its DOM surface and subscriptions. The runtime module itself remains cached by the JavaScript module loader for later blocks.
