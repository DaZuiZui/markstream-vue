---
title: CSS Custom Highlight code-block PoC
description: Experimental scoped code-block renderer using CSS Custom Highlight ranges.
keywords:
  - CSS Custom Highlight
  - code block performance
  - stream-diffs benchmark
---

<!-- Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements. See the NOTICE file distributed with this work for additional information regarding copyright ownership. The ASF licenses this file to you under the Apache License, Version 2.0. -->

# CSS Custom Highlight code-block PoC

Issue #726 adds an opt-in `CssHighlightCodeBlock` prototype. It keeps a plain
`<pre><code>` while a block is streaming and applies namespaced CSS Custom
Highlight ranges only after the node settles.

```ts
import { setCustomComponents } from 'markstream-vue'
import MyCssHighlightCodeBlock from './MyCssHighlightCodeBlock.vue'

setCustomComponents('css-highlight-benchmark', {
  code_block: MyCssHighlightCodeBlock,
})
```

`CssHighlightCodeBlock` is intentionally a repository-local experiment, not a
published root export. Copy the prototype source from this repository into
your application, adapt it to your lexer/highlighter, and register it through
the stable `code_block` override API.

The adapter intentionally uses a small lexer rather than MicroLighter's
module-global `highlightAll()` API. Each instance receives a unique registry
prefix, uses `StaticRange`, cancels stale work, and removes all ranges on
unmount. Unsupported browsers and languages remain readable without
highlighting. This is an experiment, not a replacement for `stream-diffs`.

Run the reproducible Chrome fixture benchmark with:

```bash
pnpm benchmark:css-highlight
```

It records plain `<pre>`, this local adapter, and pinned MicroLighter 2.1.0
rows for 1/12/24 blocks and 100/1,000/10,000 lines by default. The checked-in
artifact was generated with the 100- and 1,000-line subset to keep the fixture
run practical; pass `MARKSTREAM_CSS_HIGHLIGHT_LINES=100,1000,10000` to collect
the full matrix. It also attempts the
stream-diffs main-thread surface and records an explicit `unavailable` reason
when browser import-map dependencies are not provided. The worker-pool row is
explicitly `not-run` because it requires the stream-diffs playground worker
manager.

## Decision note

The current evidence supports keeping this as a documented custom-component
recipe. A synthetic Chrome run showed that shallow DOM does not guarantee a
faster result: tokenizer and range creation dominated at 1,000-line fixtures.
The raw exploratory measurements are checked in at
`test/benchmark/css-highlight-results.json`. A release decision still requires
the real-browser matrix described in Issue #726, including MicroLighter 2.1.0
and the current `main` revision after PR #18 was merged (the fix is not yet a
published package release).
