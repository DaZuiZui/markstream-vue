# Parser pipeline

`index.ts` owns the top-level parse orchestration:

1. preprocess streaming-safe Markdown and tokenize;
2. run `preTransformTokens`;
3. reuse stable top-level nodes and convert the remaining tokens in `nodes/token-to-nodes.ts`;
4. run `postTransformTokens`, reprocessing its returned tokens when required;
5. run the HTML structure passes, final HTML loading cleanup, then `postTransformNodes`.

Dependencies point from `index.ts` to the streaming, reuse, node, and HTML stages. The node stages do not import the parser entry. `token-to-nodes.ts` records source ranges in the active runtime and exposes only its range getter to the HTML structure context.

## Runtime ownership

`ParserRuntime` is an internal owner associated with one `MarkdownIt` instance. `ParseContext` is created for each root or fragment parse and carries mutable call-local state without mutating public `ParseOptions`.

| State | Owner and key | Read/write site | Invalidation and reset | Fragment behavior |
| --- | --- | --- | --- | --- |
| Safe Markdown transform | `ParserRuntime.safeMarkdown`; raw source plus final/custom-tag mode | `streaming/safe-markdown.ts` | Non-append source, semantic option change, reset, finalization, or disposal | Full transform; never reads or writes the root entry |
| Tolerant math boundary | `ParserRuntime.tolerantMathBoundary`; source plus pending boundary key | `streaming/boundary-state.ts`, `streaming/tokenizer.ts` | Same document reset paths; boundary changes may also reset the underlying stream parser | Sync fragment parsing bypasses the entry |
| Pending explicit math tail | `ParserRuntime.pendingExplicitMathTail`; source | `streaming/boundary-state.ts` | Same document reset paths | Full scan without reading or writing the root entry |
| Stable stream environments | `ParserRuntime.streamParseEnvs`; `streaming` or `final` | `streaming/tokenizer.ts` | Same document reset paths | Sync fragment parsing does not use them |
| Last top-level parse mode | `ParserRuntime.topLevelStreamParseMode`; one value per document | `streaming/tokenizer.ts`, structured reuse | Same document reset paths | A fragment sync parse does not overwrite it |
| Structured node reuse | `ParserRuntime.structuredStream`; source, token-group boundaries, validator, and strong mode | `reuse/structured-node-reuse.ts` | Same document reset paths; an ineligible root parse evicts it | Disabled without evicting the root entry |
| Sibling HTML children | `ParserRuntime.siblingHtmlChildren`; block sequence, final/custom-tag/validator/strong mode | `html/structure.ts` | Same document reset paths; transform hooks, unmarked/custom MarkdownIt instances, and mutable validators bypass it | Nested fragments do not read or write it |
| Internal node ranges | `ParserRuntime.nodeSourceRanges`; node identity | `nodes/token-to-nodes.ts`, HTML structure passes | Replaced on document reset, finalization, or disposal | Adds ranges under fragment-node identities without replacing root-node ranges |
| Source line offsets and cursors | One `ParseContext`; current source and call identity | node source mapping and block/inline parsers | A new root or child context starts fresh | Each fragment receives a child context |

The root semantic snapshot covers custom tags, link validator identity, source-map mode, all three transform hooks, strong-closing mode, structured-reuse mode, stream mode, and the MarkdownIt custom-extension marker. A change resets the document before parsing the new semantics. Stream, structured, and sibling reuse require that managed marker to be explicitly `false`; unmarked external MarkdownIt instances use the sync path.

## Lifecycle

| Transition | Stream parser | Runtime document state | Reuse/identity rule |
| --- | --- | --- | --- |
| Same-source replay | Retained | Retained | Output is idempotent; identity is not promised solely by replay |
| Append | Retained | Retained and advanced | Stable prefix identity is retained only when structured reuse proves eligibility |
| Truncate or replacement | Reset before parse | Cleared before parse | No prefix identity reuse |
| Semantic option change | Reset before parse | Cleared before parse | No stale node reuse across semantics |
| `md.use(...)` or `md.set(...)` | Wrapped boundary resets once after the original call | Cleared | The wrapper preserves `this`, arguments, and return value; the original call runs once |
| External `md.stream.reset(...)` | Original reset runs once | Cleared without recursively resetting | The next parse starts a fresh document |
| Fragment parse | Sync only | Root caches bypassed; node ranges are additive | Cannot evict a reusable root prefix |
| Final with `streamParse: 'auto'` | Reset, then sync final parse | Cleared and marked finalized | No reuse into the next document |
| Final with explicit stream mode | Uses the requested stream/sync mode | Cleared and marked finalized | Underlying stream is reset before the next root document |
| Next document after final | Reset before parse | Fresh document state | No identity crosses the boundary |
| Internal disposal | Reset | Cleared and removed from the MarkdownIt registry | A later parse creates a new runtime owner |

## Caches intentionally outside `ParserRuntime`

| Cache | Key and lifetime | Why it remains outside the document runtime |
| --- | --- | --- |
| `parser/regex-cache.ts` and math/plugin regex maps | Pattern/flags or plugin command configuration; bounded or configuration-scoped | Cached values are pure and contain no source, token, node, or document identity |
| Block/inline HTML tag-set caches | `customHtmlTags` array identity, held weakly | The derived sets are pure configuration values and disappear with the caller's array |
| Linkify demotion inference cache | Short raw text; bounded LRU | The inferred flags are a pure function of text and are reusable across documents and MarkdownIt instances |
| Link token origin and stable-validator metadata | Token/function identity, held weakly | These maps describe plugin-produced values; they do not retain a document or control lifecycle |
| Plugin-local tag and regex metadata | One MarkdownIt plugin installation | Configuration belongs to that installed plugin, so `md.use` invalidates document state rather than moving plugin metadata |
| Clone/finalization traversal maps | One function call | Ephemeral cycle guards are call-local, not caches |
| `markdown-it-ts` stream internals | The external stream implementation | `ParserRuntime` coordinates its reset boundaries but does not take ownership of dependency internals |
